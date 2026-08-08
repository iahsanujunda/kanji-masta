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

  it("makes translation available immediately and enrolls only selected recommendations", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes><Route path="/captures/:sessionId" element={<CaptureDetailPage />} /></Routes>,
      { route: "/captures/capture-1" },
    );

    expect(await screen.findByText("1 / 4 familiar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal translation" })).toBeInTheDocument();
    expect(screen.queryByText("Train service is suspended today.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learn selected (0 / 3)" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Select 日 to learn" }));
    await user.click(screen.getByRole("button", { name: "Learn selected (1 / 3)" }));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/kanji/session", {
      method: "POST",
      body: JSON.stringify({ sessionId: "capture-1", selections: [{ kanjiMasterId: "kanji-2", status: "learning" }] }),
    });

    await user.click(screen.getByRole("button", { name: "Reveal translation" }));
    expect(screen.getByText("Train service is suspended today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide translation" })).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/api/captures/capture-1/revisited", { method: "POST" }));
  });

  it("loads recommendations repeatedly while an unfinished learning batch blocks enrollment", async () => {
    const user = userEvent.setup();
    const characters = ["日", "運", "転", "見", "合", "休", "駅"];
    const gatedCapture = {
      ...capture,
      familiarKanji: 1,
      totalKanji: 8,
      coveragePercent: 13,
      batchGateSatisfied: false,
      kanji: [
        capture.kanji[0],
        ...characters.map((character, index) => ({
          kanjiMasterId: `browse-${index + 1}`,
          character,
          onyomi: [],
          kunyomi: [],
          meanings: [`meaning-${index + 1}`],
          whyUseful: "Useful here",
          familiarity: null,
          learningState: "NOT_STARTED" as const,
          selectable: true,
          recommendedNext: index < 3,
          excluded: false,
        })),
      ],
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/captures/capture-1") return Promise.resolve(gatedCapture);
      return Promise.resolve({});
    });

    renderWithProviders(
      <Routes><Route path="/captures/:sessionId" element={<CaptureDetailPage />} /></Routes>,
      { route: "/captures/capture-1" },
    );

    expect(await screen.findByText("3 of 7 shown")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select 見 to learn" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load 3 more" }));
    expect(screen.getByText("6 of 7 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select 見 to learn" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load 1 more" }));
    expect(screen.getByText("7 of 7 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select 駅 to learn" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select 日 to learn" }));
    await user.click(screen.getByRole("button", { name: "Select 運 to learn" }));
    await user.click(screen.getByRole("button", { name: "Select 転 to learn" }));
    await user.click(screen.getByRole("button", { name: "Select 見 to learn" }));

    expect(screen.getByRole("button", { name: "Select 見 to learn" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Learn selected (3 / 3)" })).toBeDisabled();
    expect(screen.getByText("Finish your current batch to learn these")).toBeInTheDocument();
  });

  it("retries translation independently after visual analysis is saved", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/captures/capture-1") return Promise.resolve({
        ...capture,
        status: "needs_attention",
        translation: null,
        tasks: [
          { taskType: "VISUAL_ANALYSIS", status: "done", failureCode: null },
          { taskType: "TRANSLATION", status: "failed", failureCode: "provider_failed" },
        ],
      });
      return Promise.resolve({});
    });
    renderWithProviders(
      <Routes><Route path="/captures/:sessionId" element={<CaptureDetailPage />} /></Routes>,
      { route: "/captures/capture-1" },
    );

    expect(await screen.findByText("Translation needs attention")).toBeInTheDocument();
    expect(screen.getByText(/will not analyse the photo again/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry translation" }));
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/captures/capture-1/tasks/TRANSLATION/retry",
      { method: "POST" },
    );
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
