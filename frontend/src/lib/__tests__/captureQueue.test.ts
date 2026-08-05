import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
type UploadResult = {
  data: { path: string } | null;
  error: { statusCode?: number; message: string } | null;
};

const upload = vi.fn(async (): Promise<UploadResult> => {
  order.push("upload");
  return { data: { path: "test-user/capture.jpg" }, error: null };
});
const createSignedUrl = vi.fn(async () => ({
  data: { signedUrl: "https://example.com/signed.jpg" },
  error: null,
}));
const apiFetch = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: { from: () => ({ upload, createSignedUrl }) },
  },
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number) { super(`API error: ${status}`); }
  },
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import {
  CAPTURE_STORAGE_LIMITS,
  CaptureCapacityError,
  cleanupCaptureQueue,
  deleteLocalCapturesForUser,
  drainCaptureQueue,
  getCaptureMetrics,
  getCaptureStorageSummary,
  getLocalCapture,
  listLocalCaptures,
  recordCaptureSave,
  recordCaptureStorageFailure,
  requestPersistentCaptureStorage,
  retryLocalCapture,
  saveLocalCapture,
} from "@/lib/captureQueue";
import * as captureImage from "@/lib/captureImage";

const userId = "capture-queue-test-user";

function record(id = crypto.randomUUID()) {
  return {
    id,
    userId,
    blob: new Blob(["photo"], { type: "image/jpeg" }),
    storagePath: `${userId}/${id}.jpg`,
    status: "pending" as const,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

describe("captureQueue", () => {
  beforeEach(async () => {
    await deleteLocalCapturesForUser(userId);
    order.length = 0;
    upload.mockClear();
    upload.mockImplementation(async () => {
      order.push("upload");
      return { data: { path: "test-user/capture.jpg" }, error: null };
    });
    createSignedUrl.mockClear();
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ sessionId: "server-session", status: "processing" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as Navigator & { storage?: StorageManager }).storage;
  });

  it("commits the photo before storage upload begins", async () => {
    const capture = record();
    await saveLocalCapture(capture);
    order.push("committed");

    await drainCaptureQueue(userId);

    expect(order).toEqual(["committed", "upload"]);
    const handedOff = await getLocalCapture(capture.id);
    expect(handedOff).toMatchObject({ status: "server-owned", sessionId: "server-session" });
    expect(handedOff?.blob).toBeUndefined();
  });

  it("retries a lost analyze response with the same client capture id", async () => {
    const capture = record();
    await saveLocalCapture(capture);
    apiFetch.mockRejectedValueOnce(new TypeError("network lost"));

    await drainCaptureQueue(userId);
    expect((await getLocalCapture(capture.id))?.status).toBe("pending");

    await retryLocalCapture(capture.id);
    apiFetch.mockResolvedValueOnce({ sessionId: "one-session", status: "processing" });
    await drainCaptureQueue(userId);

    const requestIds = apiFetch.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).clientCaptureId);
    expect(requestIds).toEqual([capture.id, capture.id]);
    expect((await getLocalCapture(capture.id))?.sessionId).toBe("one-session");
  });

  it("treats an existing deterministic storage object as resumable", async () => {
    const capture = record();
    await saveLocalCapture(capture);
    upload.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 409, message: "The resource already exists" },
    });

    await drainCaptureQueue(userId);

    expect(createSignedUrl).toHaveBeenCalledWith(capture.storagePath, 600);
    expect((await getLocalCapture(capture.id))?.status).toBe("server-owned");
  });

  it("keeps terminal upload failures visible with the original blob", async () => {
    const capture = record();
    await saveLocalCapture(capture);
    upload.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 413, message: "Image is too large" },
    });

    await drainCaptureQueue(userId);

    const failed = await getLocalCapture(capture.id);
    expect(failed).toMatchObject({ status: "failed", lastError: "Image is too large" });
    expect(failed?.blob).toBeDefined();
  });

  it("only drains captures belonging to the authenticated user", async () => {
    const ownCapture = record();
    const otherCapture = { ...record(), userId: "another-user" };
    await saveLocalCapture(ownCapture);
    await saveLocalCapture(otherCapture);

    await drainCaptureQueue(userId);

    expect((await getLocalCapture(ownCapture.id))?.status).toBe("server-owned");
    expect((await getLocalCapture(otherCapture.id))?.status).toBe("pending");
    await deleteLocalCapturesForUser("another-user");
  });

  it("allows reconnect to override a pending backoff", async () => {
    const capture = record();
    await saveLocalCapture(capture);
    upload.mockRejectedValueOnce(new TypeError("offline"));
    await drainCaptureQueue(userId);
    expect((await getLocalCapture(capture.id))?.nextAttemptAt).toBeDefined();

    upload.mockClear();
    await drainCaptureQueue(userId);
    expect(upload).not.toHaveBeenCalled();

    await drainCaptureQueue(userId, undefined, true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect((await getLocalCapture(capture.id))?.status).toBe("server-owned");
  });

  it("treats persistent-storage denial as a supported state", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: vi.fn().mockResolvedValue(false), estimate: vi.fn().mockResolvedValue({}) },
    });

    await expect(requestPersistentCaptureStorage()).resolves.toBe("denied");
    expect((await getCaptureStorageSummary(userId)).persistence).toBe("denied");
  });

  it("stops accepting new photos at the count limit without evicting saved blobs", async () => {
    for (let index = 0; index < CAPTURE_STORAGE_LIMITS.maxCount; index += 1) {
      await saveLocalCapture(record(`capacity-${index}`));
    }

    await expect(saveLocalCapture(record("capacity-overflow"))).rejects.toBeInstanceOf(CaptureCapacityError);
    const saved = await listLocalCaptures(userId);
    expect(saved).toHaveLength(CAPTURE_STORAGE_LIMITS.maxCount);
    expect(saved.every((capture) => capture.blob)).toBe(true);
  });

  it("stops accepting new photos at the byte limit without evicting the existing photo", async () => {
    const fullBlob = new Blob(["photo"], { type: "image/jpeg" });
    Object.defineProperty(fullBlob, "size", { value: CAPTURE_STORAGE_LIMITS.maxTotalBytes });
    const fullCapture = { ...record("byte-limit-full"), blob: fullBlob, byteSize: fullBlob.size };
    await saveLocalCapture(fullCapture);

    await expect(saveLocalCapture(record("byte-limit-overflow"))).rejects.toBeInstanceOf(CaptureCapacityError);
    expect((await getLocalCapture(fullCapture.id))?.blob).toBeDefined();
  });

  it("cleans old handed-off metadata but never age-evicts an unowned blob", async () => {
    const oldDate = "2026-01-01T00:00:00.000Z";
    const pending = { ...record("old-pending"), createdAt: oldDate, updatedAt: oldDate };
    const handedOff = {
      ...record("old-handed-off"),
      blob: undefined,
      byteSize: 0,
      status: "server-owned" as const,
      sessionId: "session-old",
      createdAt: oldDate,
      updatedAt: oldDate,
    };
    await saveLocalCapture(pending);
    await saveLocalCapture(handedOff);

    expect(await cleanupCaptureQueue(userId, new Date("2026-08-05T00:00:00.000Z").getTime())).toBe(1);
    expect((await getLocalCapture(pending.id))?.blob).toBeDefined();
    expect(await getLocalCapture(handedOff.id)).toBeUndefined();
  });

  it("pauses on expired authentication and recovers after the same user signs in", async () => {
    const capture = record("auth-recovery");
    await saveLocalCapture(capture);
    upload.mockResolvedValueOnce({ data: null, error: { statusCode: 401, message: "JWT expired" } });

    await drainCaptureQueue(userId, undefined, true);
    expect(await getLocalCapture(capture.id)).toMatchObject({
      status: "needs-auth",
      lastError: "Sign in to continue uploading",
    });

    upload.mockClear();
    await drainCaptureQueue(userId);
    expect(upload).not.toHaveBeenCalled();

    await drainCaptureQueue(userId, undefined, true);
    expect(upload).toHaveBeenCalledOnce();
    expect((await getLocalCapture(capture.id))?.status).toBe("server-owned");
  });

  it("drains multiple pending captures without dropping one", async () => {
    const first = record("multiple-first");
    const second = record("multiple-second");
    await saveLocalCapture(first);
    await saveLocalCapture(second);

    await drainCaptureQueue(userId);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect((await getLocalCapture(first.id))?.status).toBe("server-owned");
    expect((await getLocalCapture(second.id))?.status).toBe("server-owned");
  });

  it("commits a smaller replacement before uploading an oversized photo", async () => {
    const capture = record("optimized-photo");
    const replacement = new Blob(["small"], { type: "image/jpeg" });
    vi.spyOn(captureImage, "optimizeCaptureBlob").mockResolvedValue({
      blob: replacement,
      optimized: true,
      originalBytes: 8 * 1024 * 1024,
    });
    upload.mockImplementationOnce(async (_path, blob) => {
      expect((await getLocalCapture(capture.id))?.byteSize).toBe(replacement.size);
      expect(blob).toBe(replacement);
      return { data: { path: capture.storagePath }, error: null };
    });
    await saveLocalCapture(capture);

    await drainCaptureQueue(userId);

    expect((await getLocalCapture(capture.id))?.originalByteSize).toBe(8 * 1024 * 1024);
  });

  it("stores privacy-safe aggregate measurements without image data or URLs", async () => {
    const metricsUser = `metrics-${crypto.randomUUID()}`;
    const capture = { ...record("metrics-photo"), userId: metricsUser, storagePath: `${metricsUser}/secret.jpg` };
    await saveLocalCapture(capture);
    await recordCaptureSave(metricsUser, 42);
    await recordCaptureStorageFailure(metricsUser);
    await drainCaptureQueue(metricsUser);

    const metrics = await getCaptureMetrics(metricsUser);
    const serialized = JSON.stringify(metrics);
    expect(metrics).toMatchObject({ saveCount: 1, maxSaveDurationMs: 42, uploadAttempts: 1, storageFailures: 1 });
    expect(serialized).not.toContain("secret.jpg");
    expect(serialized).not.toContain("signed.jpg");
    expect(serialized).not.toContain("photo");
    await deleteLocalCapturesForUser(metricsUser);
  });
});
