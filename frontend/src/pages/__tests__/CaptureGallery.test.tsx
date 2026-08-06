import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import CaptureGallery from "@/pages/CaptureGallery";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
vi.mock("@/hooks/useSignedPhotoUrl", () => ({ useSignedPhotoUrl: () => ({ data: "preview.jpg" }) }));

describe("CaptureGallery", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      captures: [{
        sessionId: "capture-1",
        label: "本日は運転を見合わせます",
        storagePath: "test-user/capture-1.jpg",
        status: "ready",
        createdAt: "2026-08-06T08:00:00Z",
        readyAt: "2026-08-06T08:01:00Z",
        lastRevisitedAt: null,
        familiarKanji: 6,
        totalKanji: 12,
        coveragePercent: 50,
        translationAvailable: true,
      }],
    });
  });

  it("shows retained captures and reverses the active sort when its tab is tapped again", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes><Route path="/captures" element={<CaptureGallery />} /></Routes>,
      { route: "/captures" },
    );

    expect(await screen.findByText("本日は運転を見合わせます")).toBeInTheDocument();
    expect(screen.getByText("6 / 12 familiar")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/captures?sort=recent&direction=desc");

    await user.click(screen.getByRole("tab", { name: "Recent, descending" }));
    expect(await screen.findByRole("tab", { name: /Recent, ascending/ })).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/captures?sort=recent&direction=asc");
  });
});
