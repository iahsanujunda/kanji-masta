import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhotoActivityControl from "@/components/activity/PhotoActivityControl";
import { renderWithProviders } from "@/test/mocks";
import { deleteLocalCapturesForUser, saveLocalCapture } from "@/lib/captureQueue";

const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const latestTerminalAt = "2026-08-05T05:10:00Z";

describe("PhotoActivityControl", () => {
  beforeEach(async () => {
    mockApiFetch.mockReset();
    await deleteLocalCapturesForUser("test-user");
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") {
        return Promise.resolve({ hasUnseen: true, latestTerminalAt });
      }
      if (path === "/api/photo/activity?limit=20") {
        return Promise.resolve({
          items: [{
            sessionId: "scan-ready",
            storagePath: null,
            status: "done",
            createdAt: "2026-08-05T05:00:00Z",
            updatedAt: latestTerminalAt,
            kanjiCount: 5,
          }],
          nextCursor: null,
          hasMore: false,
        });
      }
      if (path === "/api/photo/activity/seen") return Promise.resolve({ acknowledged: true });
      throw new Error(`Unexpected API call: ${path}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the unseen dot as soon as Activity opens and acknowledges its watermark", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PhotoActivityControl userId="test-user" />);

    expect(await screen.findByTestId("photo-activity-unseen-dot")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activity, new updates" }));

    expect(screen.queryByTestId("photo-activity-unseen-dot")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Activity" })).toBeInTheDocument();
    expect(await screen.findByText("Scan ready")).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/photo/activity/seen",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ seenThrough: latestTerminalAt }) }),
    ));
  });

  it("shows optional word discovery progress without making the capture unavailable", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: false, latestTerminalAt: null });
      if (path === "/api/photo/activity?limit=20") return Promise.resolve({
        items: [{
          sessionId: "capture-words",
          storagePath: null,
          status: "done",
          createdAt: "2026-08-05T05:00:00Z",
          updatedAt: "2026-08-05T05:10:00Z",
          kanjiCount: 5,
          taskType: "CAPTURE_WORD_DISCOVERY",
          taskStatus: "processing",
        }],
        nextCursor: null,
        hasMore: false,
      });
      throw new Error(`Unexpected API call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<PhotoActivityControl userId="test-user" />);

    await user.click(await screen.findByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Finding words")).toBeInTheDocument();
    expect(screen.getByText("Your capture remains ready")).toBeInTheDocument();
  });

  it("loads the next cursor page when the drawer sentinel becomes visible", async () => {
    let onIntersect: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersect = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: false, latestTerminalAt: null });
      if (path === "/api/photo/activity?limit=20") {
        return Promise.resolve({
          items: [{ sessionId: "scan-active", storagePath: null, status: "processing", createdAt: "2026-08-05T05:00:00Z", updatedAt: "2026-08-05T05:00:00Z", kanjiCount: null }],
          nextCursor: "cursor-2",
          hasMore: true,
        });
      }
      if (path === "/api/photo/activity?limit=20&cursor=cursor-2") {
        return Promise.resolve({
          items: [{ sessionId: "scan-failed", storagePath: null, status: "failed", createdAt: "2026-08-04T05:00:00Z", updatedAt: "2026-08-04T05:01:00Z", kanjiCount: null }],
          nextCursor: null,
          hasMore: false,
        });
      }
      throw new Error(`Unexpected API call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<PhotoActivityControl userId="test-user" />);
    await user.click(await screen.findByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Analysing photo")).toBeInTheDocument();
    await waitFor(() => expect(onIntersect).toBeDefined());

    act(() => onIntersect!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));

    expect(await screen.findByText("Scan did not finish")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/photo/activity?limit=20&cursor=cursor-2");
  });

  it("keeps loaded activity visible when an older page fails and retries inline", async () => {
    let onIntersect: IntersectionObserverCallback | undefined;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { onIntersect = callback; }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    let olderAttempts = 0;
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: false, latestTerminalAt: null });
      if (path === "/api/photo/activity?limit=20") {
        return Promise.resolve({
          items: [{ sessionId: "scan-active", storagePath: null, status: "processing", createdAt: "2026-08-05T05:00:00Z", updatedAt: "2026-08-05T05:00:00Z", kanjiCount: null }],
          nextCursor: "retry-cursor",
          hasMore: true,
        });
      }
      if (path === "/api/photo/activity?limit=20&cursor=retry-cursor") {
        olderAttempts += 1;
        if (olderAttempts === 1) return Promise.reject(new Error("offline"));
        return Promise.resolve({
          items: [{ sessionId: "scan-older", storagePath: null, status: "done", createdAt: "2026-08-03T05:00:00Z", updatedAt: "2026-08-03T05:01:00Z", kanjiCount: 3 }],
          nextCursor: null,
          hasMore: false,
        });
      }
      throw new Error(`Unexpected API call: ${path}`);
    });

    const user = userEvent.setup();
    renderWithProviders(<PhotoActivityControl userId="test-user" />);
    await user.click(await screen.findByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Analysing photo")).toBeInTheDocument();
    await waitFor(() => expect(onIntersect).toBeDefined());
    act(() => onIntersect!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));

    const error = await screen.findByRole("alert");
    expect(screen.getByText("Analysing photo")).toBeInTheDocument();
    await user.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("3 kanji found")).toBeInTheDocument();
  });

  it("shows an informational empty state without a capture button", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: false, latestTerminalAt: null });
      if (path === "/api/photo/activity?limit=20") return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
      throw new Error(`Unexpected API call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<PhotoActivityControl userId="test-user" />);

    await user.click(await screen.findByRole("button", { name: "Activity" }));
    const drawer = await screen.findByRole("dialog", { name: "Activity" });
    expect(await within(drawer).findByText("No scan activity yet")).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: /Capture Japanese/i })).not.toBeInTheDocument();
  });

  it("keeps a device-local capture visible before a server job exists", async () => {
    const blob = new Blob(["queued-photo"], { type: "image/jpeg" });
    await saveLocalCapture({
      id: "local-queued",
      userId: "test-user",
      blob,
      byteSize: blob.size,
      storagePath: "test-user/local-queued.jpg",
      status: "pending",
      attempts: 0,
      createdAt: "2026-08-05T05:20:00Z",
    });
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: false, latestTerminalAt: null });
      if (path === "/api/photo/activity?limit=20") return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
      throw new Error(`Unexpected API call: ${path}`);
    });
    const user = userEvent.setup();
    renderWithProviders(<PhotoActivityControl userId="test-user" />);

    await user.click(await screen.findByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Waiting to upload")).toBeInTheDocument();
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });
});
