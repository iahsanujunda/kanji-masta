import { openDB, type DBSchema } from "idb";
import { ApiError, apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type LocalCaptureStatus = "pending" | "uploading" | "starting" | "server-owned" | "failed";

export interface LocalCapture {
  id: string;
  userId: string;
  blob?: Blob;
  storagePath: string;
  status: LocalCaptureStatus;
  sessionId?: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt: string;
}

interface CaptureDatabase extends DBSchema {
  captures: {
    key: string;
    value: LocalCapture;
    indexes: { "by-user-created": [string, string] };
  };
}

export const CAPTURE_QUEUE_CHANGED = "kanji-masta:capture-queue-changed";
const DATABASE_NAME = "kanji-masta-captures";

const database = openDB<CaptureDatabase>(DATABASE_NAME, 1, {
  upgrade(db) {
    const store = db.createObjectStore("captures", { keyPath: "id" });
    store.createIndex("by-user-created", ["userId", "createdAt"]);
  },
});

function announceChange() {
  window.dispatchEvent(new Event(CAPTURE_QUEUE_CHANGED));
}

export async function saveLocalCapture(capture: LocalCapture): Promise<void> {
  const db = await database;
  await db.put("captures", capture);
  announceChange();
}

export async function getLocalCapture(id: string): Promise<LocalCapture | undefined> {
  const db = await database;
  return db.get("captures", id);
}

export async function listLocalCaptures(userId: string): Promise<LocalCapture[]> {
  const db = await database;
  const captures = await db.getAllFromIndex(
    "captures",
    "by-user-created",
    IDBKeyRange.bound([userId, ""], [userId, "\uffff"]),
  );
  return captures.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
  const updated = { ...current, ...changes };
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
    if (!force && capture.nextAttemptAt && new Date(capture.nextAttemptAt) > new Date()) continue;
    await processCapture(capture, signal);
  }
}

async function processCapture(capture: LocalCapture, signal?: AbortSignal): Promise<void> {
  const attempts = capture.attempts + 1;
  try {
    await updateLocalCapture(capture.id, { status: "uploading", attempts, lastError: undefined });
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(capture.storagePath, capture.blob!, {
        contentType: capture.blob!.type || "image/jpeg",
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
      status: "server-owned",
      sessionId: result.sessionId,
      nextAttemptAt: undefined,
      lastError: undefined,
    });
  } catch (error) {
    if (signal?.aborted) return;
    const canRetry = retryable(error);
    await updateLocalCapture(capture.id, {
      status: canRetry ? "pending" : "failed",
      attempts,
      nextAttemptAt: canRetry ? new Date(Date.now() + retryDelay(attempts)).toISOString() : undefined,
      lastError: canRetry ? "Waiting for a connection" : errorMessage(error),
    });
  }
}
