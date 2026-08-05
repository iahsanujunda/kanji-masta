import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const drainCaptureQueue = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const cleanupCaptureQueue = vi.hoisted(() => vi.fn(() => Promise.resolve(0)));

vi.mock("@/lib/captureQueue", () => ({
  CAPTURE_QUEUE_CHANGED: "kanji-masta:capture-queue-changed",
  cleanupCaptureQueue,
  drainCaptureQueue,
  listLocalCaptures: vi.fn(() => Promise.resolve([])),
}));

import { useCaptureQueue } from "@/hooks/useCaptureQueue";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCaptureQueue", () => {
  beforeEach(() => {
    drainCaptureQueue.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("drains immediately at startup", async () => {
    renderHook(() => useCaptureQueue("queue-user"), { wrapper });
    await waitFor(() => expect(drainCaptureQueue).toHaveBeenCalled());
    expect(drainCaptureQueue.mock.calls[0][0]).toBe("queue-user");
    expect(drainCaptureQueue.mock.calls[0][2]).toBe(true);
  });

  it("forces an immediate drain on online, focus, and visible events", async () => {
    renderHook(() => useCaptureQueue("queue-user"), { wrapper });
    await waitFor(() => expect(drainCaptureQueue).toHaveBeenCalledTimes(1));
    drainCaptureQueue.mockClear();

    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(drainCaptureQueue).toHaveBeenCalledTimes(3));
    expect(drainCaptureQueue.mock.calls.every((call) => call[2] === true)).toBe(true);
  });
});
