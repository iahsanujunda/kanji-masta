import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import Capture from "@/pages/Capture";
import LocalCaptureDetail from "@/pages/LocalCaptureDetail";
import ScanDetail from "@/pages/ScanDetail";
import { CaptureCapacityError, deleteLocalCapturesForUser, saveLocalCapture } from "@/lib/captureQueue";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/captureQueue", { spy: true });
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe("capture resilience routes", () => {
  beforeEach(async () => {
    mockApiFetch.mockReset();
    vi.mocked(saveLocalCapture).mockReset();
    vi.mocked(saveLocalCapture).mockImplementation((capture) =>
      vi.importActual<typeof import("@/lib/captureQueue")>("@/lib/captureQueue")
        .then((actual) => actual.saveLocalCapture(capture)),
    );
    await deleteLocalCapturesForUser("test-user");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows safe-to-close only after the local transaction commits", async () => {
    let commit!: () => void;
    vi.mocked(saveLocalCapture).mockImplementationOnce(() => new Promise<void>((resolve) => { commit = resolve; }));
    renderWithProviders(
      <Routes>
        <Route path="/capture" element={<><Capture /><LocationProbe /></>} />
        <Route path="/capture-queue/:clientCaptureId" element={<><div>You can close the app</div><LocationProbe /></>} />
      </Routes>,
      { route: "/capture" },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["photo"], "station.jpg", { type: "image/jpeg" })] } });

    expect(screen.getByText("Saving photo…")).toBeInTheDocument();
    expect(screen.queryByText("You can close the app")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/capture");

    await waitFor(() => expect(saveLocalCapture).toHaveBeenCalledOnce());
    await act(async () => commit());
    expect(await screen.findByText("You can close the app")).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toMatch(/^\/capture-queue\//);
  });

  it("keeps unsafe copy and offers Retry when IndexedDB rejects the photo", async () => {
    vi.mocked(saveLocalCapture).mockRejectedValueOnce(new DOMException("Storage quota exceeded", "QuotaExceededError"));
    renderWithProviders(<><Capture /><LocationProbe /></>, { route: "/capture" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["photo"], "station.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("Photo not saved")).toBeInTheDocument();
    expect(screen.getByText("Storage quota exceeded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry saving" })).toBeEnabled();
    expect(screen.queryByText("You can close the app")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/capture");
  });

  it("links to queue management when existing saved photos fill the limit", async () => {
    vi.mocked(saveLocalCapture).mockRejectedValueOnce(new CaptureCapacityError("Your saved-photo queue is full."));
    renderWithProviders(
      <Routes>
        <Route path="/capture" element={<Capture />} />
        <Route path="/capture-queue" element={<div>Queue management</div>} />
      </Routes>,
      { route: "/capture" },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["photo"], "station.jpg", { type: "image/jpeg" })] } });

    await userEvent.click(await screen.findByRole("button", { name: "Manage saved photos" }));
    expect(screen.getByText("Queue management")).toBeInTheDocument();
  });

  it.each(["pending", "uploading"] as const)("restores a %s capture from the route after reload", async (status) => {
    const id = crypto.randomUUID();
    await saveLocalCapture({
      id,
      userId: "test-user",
      blob: new Blob(["photo"], { type: "image/jpeg" }),
      storagePath: `test-user/${id}.jpg`,
      status,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });

    renderWithProviders(
      <Routes><Route path="/capture-queue/:clientCaptureId" element={<LocalCaptureDetail />} /></Routes>,
      { route: `/capture-queue/${id}` },
    );

    expect(await screen.findByText("Analysing")).toBeInTheDocument();
    expect(screen.getByText("You can close the app")).toBeInTheDocument();
  });

  it("replaces the local route with the server scan after handoff", async () => {
    const id = crypto.randomUUID();
    await saveLocalCapture({
      id,
      userId: "test-user",
      storagePath: `test-user/${id}.jpg`,
      status: "server-owned",
      sessionId: "accepted-session",
      attempts: 1,
      createdAt: new Date().toISOString(),
    });
    renderWithProviders(
      <Routes>
        <Route path="/capture-queue/:clientCaptureId" element={<><LocalCaptureDetail /><LocationProbe /></>} />
        <Route path="/captures/:sessionId" element={<><div>Server capture</div><LocationProbe /></>} />
      </Routes>,
      { route: `/capture-queue/${id}` },
    );

    expect(await screen.findByText("Server capture")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/captures/accepted-session");
  });

  it("loads a completed scan from its URL without navigation state", async () => {
    mockApiFetch.mockResolvedValue({ sessionId: "server-session", status: "done", kanji: [] });
    renderWithProviders(
      <Routes><Route path="/scans/:sessionId" element={<ScanDetail />} /></Routes>,
      { route: "/scans/server-session" },
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/photo/session/server-session"));
    expect(await screen.findByText("0 detected")).toBeInTheDocument();
  });

  it("shows a retryable network error without navigating Home", async () => {
    mockApiFetch.mockRejectedValue(new TypeError("offline"));
    renderWithProviders(
      <Routes><Route path="/scans/:sessionId" element={<><ScanDetail /><LocationProbe /></>} /></Routes>,
      { route: "/scans/network-session" },
    );

    expect(await screen.findByText("Couldn’t refresh this scan", {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/scans/network-session");

    mockApiFetch.mockResolvedValue({ sessionId: "network-session", status: "processing" });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Analysing")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/scans/network-session");
  });

  it("never silently navigates Home after thirty seconds of processing", async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue({ sessionId: "slow-session", status: "processing" });
    renderWithProviders(
      <Routes><Route path="/scans/:sessionId" element={<><ScanDetail /><LocationProbe /></>} /></Routes>,
      { route: "/scans/slow-session" },
    );
    await vi.waitFor(() => expect(screen.getByText("Analysing")).toBeInTheDocument());

    await act(() => vi.advanceTimersByTimeAsync(31_000));
    expect(screen.getByText("Analysing")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/scans/slow-session");
  });
});
