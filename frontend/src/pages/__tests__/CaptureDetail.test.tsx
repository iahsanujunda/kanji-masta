import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import CaptureDetailPage from "@/pages/CaptureDetail";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
vi.mock("@/hooks/useSignedPhotoUrl", () => ({ useSignedPhotoUrl: () => ({ data: "photo.jpg" }) }));

const capture = {
  sessionId: "capture-1",
  label: "本日は運転を見合わせます",
  storagePath: "test-user/capture-1.jpg",
  status: "ready",
  failureCode: null,
  createdAt: "2026-08-06T08:00:00Z",
  fullText: "本日は運転を見合わせます",
  translation: "Train service is suspended today.",
  translationLanguage: "en",
  familiarKanji: 1,
  totalKanji: 4,
  coveragePercent: 25,
  batchGateSatisfied: true,
  kanji: [
    { kanjiMasterId: "kanji-1", character: "本", onyomi: [], kunyomi: [], meanings: ["book"], whyUseful: "", familiarity: 5, learningState: "FAMILIAR", selectable: false, recommendedNext: false, excluded: false },
    ...["日", "運", "転"].map((character, index) => ({ kanjiMasterId: `kanji-${index + 2}`, character, onyomi: [], kunyomi: [], meanings: ["meaning"], whyUseful: "Useful here", familiarity: null, learningState: "NOT_STARTED", selectable: true, recommendedNext: true, excluded: false })),
  ],
};

describe("CaptureDetail", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/captures/capture-1") return Promise.resolve(capture);
      return Promise.resolve({});
    });
  });

  it("makes translation available immediately and offers only the recommended next batch", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes><Route path="/captures/:sessionId" element={<CaptureDetailPage />} /></Routes>,
      { route: "/captures/capture-1" },
    );

    expect(await screen.findByText("1 / 4 familiar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal translation" })).toBeInTheDocument();
    expect(screen.queryByText("Train service is suspended today.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learn these 3" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reveal translation" }));
    expect(screen.getByText("Train service is suspended today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide translation" })).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/captures/capture-1/revisited", { method: "POST" }));
  });
});
