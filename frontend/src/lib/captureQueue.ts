import { openDB, type DBSchema } from "idb";
import { ApiError, apiFetch } from "@/lib/api";
import { optimizeCaptureBlob } from "@/lib/captureImage";
import { supabase } from "@/lib/supabase";

export type LocalCaptureStatus =
  | "pending"
  | "uploading"
  | "starting"
  | "needs-auth"
  | "server-owned"
  | "failed";

export interface LocalCapture {
  id: string;
  userId: string;
  blob?: Blob;
  storagePath: string;
  status: LocalCaptureStatus;
  sessionId?: string;
  attempts: number;
  byteSize?: number;
  originalByteSize?: number;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt?: string;
}

interface CaptureMetaEntry {
  key: string;
  value: unknown;
}

interface CaptureDatabase extends DBSchema {
  captures: {
    key: string;
    value: LocalCapture;
    indexes: { "by-user-created": [string, string] };
  };
}

interface CaptureMetaDatabase extends DBSchema {
  meta: {
    key: string;
    value: CaptureMetaEntry;
  };
}

export const CAPTURE_QUEUE_CHANGED = "kanji-masta:capture-queue-changed";
export const CAPTURE_STORAGE_LIMITS = {
  maxCount: 12,
  maxTotalBytes: 120 * 1024 * 1024,
  attentionAfterDays: 30,
  cleanupServerOwnedAfterHours: 24,
} as const;

export type CapturePersistenceStatus = "unknown" | "granted" | "denied" | "unsupported";

export interface CaptureMetrics {
  saveCount: number;
  totalSaveDurationMs: number;
  maxSaveDurationMs: number;
  uploadAttempts: number;
  uploadRetries: number;
  completedQueueAgeTotalMs: number;
  maxCompletedQueueAgeMs: number;
  storageFailures: number;
  authFailures: number;
  optimizedPhotos: number;
  bytesBeforeOptimization: number;
  bytesAfterOptimization: number;
}

export interface CaptureStorageSummary {
  count: number;
  totalBytes: number;
  oldestCreatedAt?: string;
  hasAgedCapture: boolean;
  persistence: CapturePersistenceStatus;
  browserUsage?: number;
  browserQuota?: number;
}

export class CaptureCapacityError extends Error {
  readonly code = "capture-capacity";

  constructor(message: string) {
    super(message);
    this.name = "CaptureCapacityError";
  }
}

const DATABASE_NAME = "kanji-masta-captures";
const META_DATABASE_NAME = "kanji-masta-capture-meta";
const PERSISTENCE_META_KEY = "storage-persistence";

const emptyMetrics = (): CaptureMetrics => ({
  saveCount: 0,
  totalSaveDurationMs: 0,
  maxSaveDurationMs: 0,
  uploadAttempts: 0,
  uploadRetries: 0,
  completedQueueAgeTotalMs: 0,
  maxCompletedQueueAgeMs: 0,
  storageFailures: 0,
  authFailures: 0,
  optimizedPhotos: 0,
  bytesBeforeOptimization: 0,
  bytesAfterOptimization: 0,
});

const database = openDB<CaptureDatabase>(DATABASE_NAME, 1, {
  upgrade(db) {
    const store = db.createObjectStore("captures", { keyPath: "id" });
    store.createIndex("by-user-created", ["userId", "createdAt"]);
  },
});

// Keep policy/metrics metadata in a separate database so deploying Milestone 2
// never blocks on a still-open Milestone 1 tab holding the queue database.
const metadataDatabase = openDB<CaptureMetaDatabase>(META_DATABASE_NAME, 1, {
  upgrade(db) {
    db.createObjectStore("meta", { keyPath: "key" });
  },
});

function announceChange() {
  window.dispatchEvent(new Event(CAPTURE_QUEUE_CHANGED));
}

function normalized(capture: LocalCapture): LocalCapture {
  return {
    ...capture,
    byteSize: capture.byteSize ?? capture.blob?.size ?? 0,
    updatedAt: capture.updatedAt ?? capture.createdAt,
  };
}

function captureBytes(capture: LocalCapture): number {
  return capture.blob?.size ?? capture.byteSize ?? 0;
}

export async function saveLocalCapture(capture: LocalCapture): Promise<void> {
  const db = await database;
  const transaction = db.transaction("captures", "readwrite");
  const existing = await transaction.store.get(capture.id);
  const captures = await transaction.store.index("by-user-created").getAll(
    IDBKeyRange.bound([capture.userId, ""], [capture.userId, "\uffff"]),
  );
  const others = captures.filter((item) => item.id !== capture.id && item.blob);
  const nextCount = others.length + (capture.blob ? 1 : 0);
  const nextBytes = others.reduce((total, item) => total + captureBytes(item), 0) + captureBytes(capture);
  if (!existing && nextCount > CAPTURE_STORAGE_LIMITS.maxCount) {
    await transaction.done;
    throw new CaptureCapacityError("Your saved-photo queue is full. Remove a saved photo before capturing another.");
  }
  if (!existing && nextBytes > CAPTURE_STORAGE_LIMITS.maxTotalBytes) {
    await transaction.done;
    throw new CaptureCapacityError("Saved photos are using the queue storage limit. Remove one before capturing another.");
  }
  await transaction.store.put(normalized(capture));
  await transaction.done;
  announceChange();
}

export async function getLocalCapture(id: string): Promise<LocalCapture | undefined> {
  const db = await database;
  const capture = await db.get("captures", id);
  return capture ? normalized(capture) : undefined;
}

export async function listLocalCaptures(userId: string): Promise<LocalCapture[]> {
  const db = await database;
  const captures = await db.getAllFromIndex(
    "captures",
    "by-user-created",
    IDBKeyRange.bound([userId, ""], [userId, "\uffff"]),
  );
  return captures.map(normalized).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function updateLocalCapture(
  id: string,
  changes: Partial<LocalCapture>,
): Promise<LocalCapture | undefined> {
  const db = await database;
  const transaction = db.transaction("captures", "readwrite");
  const current = await transaction.store.get(id);
  if (!current) {
    await transaction.done;
    return undefined;
  }
  const updated = normalized({ ...current, ...changes, updatedAt: new Date().toISOString() });
  await transaction.store.put(updated);
  await transaction.done;
  announceChange();
  return updated;
}

export async function deleteLocalCapture(id: string): Promise<void> {
  const db = await database;
  await db.delete("captures", id);
  announceChange();
}

export async function deleteLocalCapturesForUser(userId: string): Promise<void> {
  const captures = await listLocalCaptures(userId);
  const db = await database;
  const transaction = db.transaction("captures", "readwrite");
  await Promise.all(captures.map((capture) => transaction.store.delete(capture.id)));
  await transaction.done;
  announceChange();
}

export async function retryLocalCapture(id: string): Promise<void> {
  await updateLocalCapture(id, {
    status: "pending",
    nextAttemptAt: undefined,
    lastError: undefined,
  });
}

export async function cleanupCaptureQueue(userId: string, now = Date.now()): Promise<number> {
  const captures = await listLocalCaptures(userId);
  const cutoff = now - CAPTURE_STORAGE_LIMITS.cleanupServerOwnedAfterHours * 60 * 60 * 1000;
  const removable = captures.filter((capture) =>
    capture.status === "server-owned" && !capture.blob && new Date(capture.updatedAt ?? capture.createdAt).getTime() < cutoff,
  );
  if (removable.length === 0) return 0;
  const db = await database;
  const transaction = db.transaction("captures", "readwrite");
  await Promise.all(removable.map((capture) => transaction.store.delete(capture.id)));
  await transaction.done;
  announceChange();
  return removable.length;
}

export async function requestPersistentCaptureStorage(): Promise<CapturePersistenceStatus> {
  const storage = navigator.storage;
  if (!storage?.persist) {
    await storePersistenceStatus("unsupported");
    return "unsupported";
  }
  try {
    const granted = await storage.persist();
    const status: CapturePersistenceStatus = granted ? "granted" : "denied";
    await storePersistenceStatus(status);
    return status;
  } catch {
    await storePersistenceStatus("denied");
    return "denied";
  }
}

export async function getCaptureStorageSummary(userId: string): Promise<CaptureStorageSummary> {
  const captures = (await listLocalCaptures(userId)).filter((capture) => capture.blob);
  const oldestCreatedAt = captures.at(-1)?.createdAt;
  let persistence: CapturePersistenceStatus = "unknown";
  try {
    persistence = (await getMeta<CapturePersistenceStatus>(PERSISTENCE_META_KEY)) ?? "unknown";
  } catch {
    // Queue management still works when optional metadata storage is unavailable.
  }
  let estimate: StorageEstimate = {};
  try {
    estimate = await navigator.storage?.estimate?.() ?? {};
  } catch {
    // Queue-owned byte totals remain available when the browser estimate fails.
  }
  return {
    count: captures.length,
    totalBytes: captures.reduce((total, capture) => total + captureBytes(capture), 0),
    oldestCreatedAt,
    hasAgedCapture: Boolean(oldestCreatedAt && Date.now() - new Date(oldestCreatedAt).getTime()
      >= CAPTURE_STORAGE_LIMITS.attentionAfterDays * 24 * 60 * 60 * 1000),
    persistence,
    browserUsage: estimate.usage,
    browserQuota: estimate.quota,
  };
}

export async function getCaptureMetrics(userId: string): Promise<CaptureMetrics> {
  try {
    return (await getMeta<CaptureMetrics>(metricsKey(userId))) ?? emptyMetrics();
  } catch {
    return emptyMetrics();
  }
}

export async function recordCaptureSave(userId: string, durationMs: number): Promise<void> {
  await updateMetrics(userId, (metrics) => ({
    ...metrics,
    saveCount: metrics.saveCount + 1,
    totalSaveDurationMs: metrics.totalSaveDurationMs + Math.max(0, durationMs),
    maxSaveDurationMs: Math.max(metrics.maxSaveDurationMs, durationMs),
  }));
}

export async function recordCaptureStorageFailure(userId: string): Promise<void> {
  await updateMetrics(userId, (metrics) => ({ ...metrics, storageFailures: metrics.storageFailures + 1 }));
}

function retryDelay(attempts: number): number {
  const boundedAttempt = Math.min(attempts, 6);
  const base = Math.min(1_000 * 2 ** boundedAttempt, 60_000);
  return base + Math.floor(Math.random() * Math.max(250, base * 0.2));
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (typeof error === "object" && error !== null) {
    const value = "statusCode" in error ? error.statusCode : "status" in error ? error.status : undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Upload did not finish";
}

function objectAlreadyExists(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();
  return status === 409 || message.includes("already exists") || message.includes("duplicate");
}

function authenticationError(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();
  return status === 401 || status === 403 || message.includes("sign in") || message.includes("access denied")
    || message.includes("jwt") || message.includes("token has expired");
}

function retryable(error: unknown): boolean {
  const status = errorStatus(error);
  return status == null || status === 408 || status === 429 || status >= 500;
}

let activeDrain: Promise<void> | null = null;

export function drainCaptureQueue(userId: string, signal?: AbortSignal, force = false): Promise<void> {
  if (activeDrain) return activeDrain;
  activeDrain = drain(userId, signal, force).finally(() => {
    activeDrain = null;
  });
  return activeDrain;
}

async function drain(userId: string, signal?: AbortSignal, force = false): Promise<void> {
  const captures = await listLocalCaptures(userId);
  for (const capture of captures) {
    if (signal?.aborted) return;
    if (capture.status === "server-owned" || capture.status === "failed" || !capture.blob) continue;
    if (capture.status === "needs-auth" && !force) continue;
    if (!force && capture.nextAttemptAt && new Date(capture.nextAttemptAt) > new Date()) continue;
    await processCapture(capture, signal);
  }
}

async function processCapture(capture: LocalCapture, signal?: AbortSignal): Promise<void> {
  const attempts = capture.attempts + 1;
  await updateMetrics(capture.userId, (metrics) => ({
    ...metrics,
    uploadAttempts: metrics.uploadAttempts + 1,
    uploadRetries: metrics.uploadRetries + (capture.attempts > 0 ? 1 : 0),
  }));
  try {
    await updateLocalCapture(capture.id, {
      status: "uploading",
      attempts,
      lastAttemptAt: new Date().toISOString(),
      lastError: undefined,
    });
    const prepared = await optimizeCaptureBlob(capture.blob!);
    let uploadBlob = prepared.blob;
    if (prepared.optimized) {
      await updateLocalCapture(capture.id, {
        blob: prepared.blob,
        byteSize: prepared.blob.size,
        originalByteSize: prepared.originalBytes,
      });
      uploadBlob = prepared.blob;
      await updateMetrics(capture.userId, (metrics) => ({
        ...metrics,
        optimizedPhotos: metrics.optimizedPhotos + 1,
        bytesBeforeOptimization: metrics.bytesBeforeOptimization + prepared.originalBytes,
        bytesAfterOptimization: metrics.bytesAfterOptimization + uploadBlob.size,
      }));
    }
    if (signal?.aborted) return;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(capture.storagePath, uploadBlob, {
        contentType: uploadBlob.type || capture.blob!.type || "image/jpeg",
        upsert: false,
      });
    if (uploadError && !objectAlreadyExists(uploadError)) throw uploadError;
    if (signal?.aborted) return;

    const { data: signedData, error: signError } = await supabase.storage
      .from("photos")
      .createSignedUrl(capture.storagePath, 600);
    if (signError || !signedData?.signedUrl) {
      throw signError ?? new Error("Could not prepare the saved photo");
    }
    if (signal?.aborted) return;

    await updateLocalCapture(capture.id, { status: "starting" });
    const result = await apiFetch<{ sessionId: string; status: "processing" }>("/api/photo/analyze", {
      method: "POST",
      signal,
      body: JSON.stringify({
        imageUrl: signedData.signedUrl,
        storagePath: capture.storagePath,
        clientCaptureId: capture.id,
      }),
    });
    await updateLocalCapture(capture.id, {
      blob: undefined,
      byteSize: 0,
      status: "server-owned",
      sessionId: result.sessionId,
      nextAttemptAt: undefined,
      lastError: undefined,
    });
    const queueAge = Math.max(0, Date.now() - new Date(capture.createdAt).getTime());
    await updateMetrics(capture.userId, (metrics) => ({
      ...metrics,
      completedQueueAgeTotalMs: metrics.completedQueueAgeTotalMs + queueAge,
      maxCompletedQueueAgeMs: Math.max(metrics.maxCompletedQueueAgeMs, queueAge),
    }));
  } catch (error) {
    if (signal?.aborted) return;
    const needsAuth = authenticationError(error);
    const canRetry = !needsAuth && retryable(error);
    if (needsAuth) {
      await updateMetrics(capture.userId, (metrics) => ({ ...metrics, authFailures: metrics.authFailures + 1 }));
    }
    await updateLocalCapture(capture.id, {
      status: needsAuth ? "needs-auth" : canRetry ? "pending" : "failed",
      attempts,
      nextAttemptAt: canRetry ? new Date(Date.now() + retryDelay(attempts)).toISOString() : undefined,
      lastError: needsAuth ? "Sign in to continue uploading" : canRetry ? "Waiting for a connection" : errorMessage(error),
    });
  }
}

function metricsKey(userId: string): string {
  return `capture-metrics:${userId}`;
}

async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await metadataDatabase;
  return (await db.get("meta", key))?.value as T | undefined;
}

async function putMeta(key: string, value: unknown): Promise<void> {
  const db = await metadataDatabase;
  await db.put("meta", { key, value });
}

async function storePersistenceStatus(status: CapturePersistenceStatus): Promise<void> {
  try {
    await putMeta(PERSISTENCE_META_KEY, status);
    announceChange();
  } catch {
    // Persistence protection remains optional even when metadata storage is unavailable.
  }
}

async function updateMetrics(userId: string, update: (metrics: CaptureMetrics) => CaptureMetrics): Promise<void> {
  try {
    const db = await metadataDatabase;
    const transaction = db.transaction("meta", "readwrite");
    const key = metricsKey(userId);
    const current = (await transaction.store.get(key))?.value as CaptureMetrics | undefined;
    await transaction.store.put({ key, value: update(current ?? emptyMetrics()) });
    await transaction.done;
  } catch {
    // Measurements must never block or downgrade capture delivery.
  }
}
