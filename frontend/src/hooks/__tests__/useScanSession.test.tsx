import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

import { useScanSession } from "@/hooks/useScanSession";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useScanSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiFetch.mockReset();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("stops processing polls while hidden and refetches immediately on focus", async () => {
    apiFetch.mockResolvedValue({ sessionId: "scan-1", status: "processing" });
    renderHook(() => useScanSession("scan-1"), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it.each(["done", "failed"] as const)("does not poll terminal %s sessions", async (status) => {
    apiFetch.mockResolvedValue({ sessionId: "scan-1", status, kanji: status === "done" ? [] : undefined });
    renderHook(() => useScanSession("scan-1"), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
