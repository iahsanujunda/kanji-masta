import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import Capture from "@/pages/Capture";
import LocalCaptureDetail from "@/pages/LocalCaptureDetail";
import ScanDetail from "@/pages/ScanDetail";
import { deleteLocalCapturesForUser, saveLocalCapture } from "@/lib/captureQueue";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

describe("capture resilience routes", () => {
  beforeEach(async () => {
    mockApiFetch.mockReset();
    await deleteLocalCapturesForUser("test-user");
  });

  it("does not claim the photo is safe while the local write is in progress", async () => {
    renderWithProviders(<Capture />, { route: "/capture" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["photo"], "station.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("Saving photo…")).toBeInTheDocument();
    expect(screen.queryByText("You can close the app")).not.toBeInTheDocument();
  });

  it("restores a queued capture from the route after reload", async () => {
    const id = crypto.randomUUID();
    await saveLocalCapture({
      id,
      userId: "test-user",
      blob: new Blob(["photo"], { type: "image/jpeg" }),
      storagePath: `test-user/${id}.jpg`,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });

    renderWithProviders(
      <Routes><Route path="/captures/:clientCaptureId" element={<LocalCaptureDetail />} /></Routes>,
      { route: `/captures/${id}` },
    );

    expect(await screen.findByText("Analysing")).toBeInTheDocument();
    expect(screen.getByText("You can close the app")).toBeInTheDocument();
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
});
