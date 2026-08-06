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
  wordDiscovery: { eligible: false, status: "LOCKED", failureCode: null, newCount: 0, learningCount: 0, familiarCount: 0, candidates: [] },
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

  it("starts discovery at full kanji coverage and enrolls only exact new candidates", async () => {
    const user = userEvent.setup();
    const mastered = {
      ...capture,
      familiarKanji: 4,
      coveragePercent: 100,
      kanji: capture.kanji.map((item) => ({ ...item, familiarity: 5, learningState: "FAMILIAR", selectable: false, recommendedNext: false })),
      wordDiscovery: { eligible: true, status: "NOT_STARTED", failureCode: null, newCount: 0, learningCount: 0, familiarCount: 0, candidates: [] },
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/captures/capture-1") return Promise.resolve(mastered);
      return Promise.resolve({});
    });
    const view = renderWithProviders(
      <Routes><Route path="/captures/:sessionId" element={<CaptureDetailPage />} /></Routes>,
      { route: "/captures/capture-1" },
    );

    await user.click(await screen.findByRole("button", { name: "Find new words" }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/captures/capture-1/word-discovery", { method: "POST" });

    const completed = {
      ...mastered,
      wordDiscovery: {
        eligible: true,
        status: "DONE",
        failureCode: null,
        newCount: 1,
        learningCount: 0,
        familiarCount: 1,
        candidates: [
          { candidateId: "word-new", surfaceText: "運転見合わせ", lemma: "運転見合わせ", reading: "うんてんみあわせ", meaning: "service suspension", kanjiMasterIds: ["kanji-3"], learningState: "NEW", familiarity: null },
          { candidateId: "word-known", surfaceText: "本日", lemma: "本日", reading: "ほんじつ", meaning: "today", kanjiMasterIds: ["kanji-1"], learningState: "FAMILIAR", familiarity: 5 },
        ],
      },
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/captures/capture-1") return Promise.resolve(completed);
      return Promise.resolve({});
    });
    view.unmount();
    renderWithProviders(
      <Routes><Route path="/captures/:sessionId" element={<CaptureDetailPage />} /></Routes>,
      { route: "/captures/capture-1" },
    );
    await waitFor(() => expect(screen.getByText("運転見合わせ")).toBeInTheDocument());
    expect(screen.getByText("本日")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Learn 1 word" }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/captures/capture-1/word-decisions", {
      method: "PUT",
      body: JSON.stringify({ candidateIds: ["word-new"] }),
    });
  });
});
