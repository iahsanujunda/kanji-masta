import { beforeEach, describe, expect, it, vi } from "vitest";

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
  deleteLocalCapturesForUser,
  drainCaptureQueue,
  getLocalCapture,
  retryLocalCapture,
  saveLocalCapture,
} from "@/lib/captureQueue";

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
});
