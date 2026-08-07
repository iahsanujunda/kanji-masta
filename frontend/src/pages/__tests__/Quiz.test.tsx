import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Quiz from "../Quiz";
import { renderWithProviders } from "@/test/mocks";
import { ApiError } from "@/lib/api";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      super(`API error: ${status}`);
      this.status = status;
      this.body = body;
    }
  },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const introCard = {
  cardType: "INTRODUCTION", cardId: "card-intro", wordId: "word-1", word: "電車", reading: "でんしゃ", meaning: "train",
  kanjiBreakdown: [{ character: "電", meaning: "electricity" }, { character: "車", meaning: "vehicle" }],
  introductionKind: "NEW", exampleSentence: "電車、遅れてるじゃん。", exampleContext: "A casual sentence.", quizType: null,
  learningStep: null, prompt: null, target: null, furigana: null, options: [], explanation: null, wordFamiliarity: 0,
};

const quizCard = {
  ...introCard, cardType: "QUIZ", cardId: "card-quiz", introductionKind: null, exampleSentence: null, exampleContext: null,
  quizType: "MEANING_RECALL", learningStep: 1, prompt: "電車", target: "電車", options: ["bus", "train", "taxi", "subway"], explanation: "電 and 車 combine directly.",
};

const session = (currentCard: typeof introCard | typeof quizCard | null, status = "ACTIVE") => ({
  slotId: "slot-1", status, version: currentCard === introCard ? 0 : 1, slotEndsAt: "2026-08-05T00:00:00Z", currentCard,
  progress: { completed: currentCard === quizCard ? 0 : 5, allowance: 5, remaining: currentCard === quizCard ? 5 : 0 },
  summary: { newWordsLearned: 0, reintroducedWordsLearned: 0, reviewsCorrect: 0, toRevisit: 0 },
});

describe("Quiz Phase 3 session", () => {
  beforeEach(() => mockApiFetch.mockReset());

  it("shows a resilient loading state", async () => {
    let resolve!: (value: unknown) => void;
    mockApiFetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = renderWithProviders(<Quiz />);
    expect(screen.getByText("Preparing your session…")).toBeInTheDocument();
    resolve({ session: session(introCard) });
    await screen.findByText("電車");
    view.unmount();
  });

  it("renders a new-word introduction without answer controls", async () => {
    mockApiFetch.mockResolvedValue({ session: session(introCard) });
    renderWithProviders(<Quiz />);
    expect(await screen.findByText("電車")).toBeInTheDocument();
    expect(screen.getByText("electricity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(screen.queryByText("bus")).not.toBeInTheDocument();
  });

  it("acknowledges an introduction using the current card and version", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ session: session(introCard) })
      .mockResolvedValueOnce({ feedback: { type: "INTRODUCED" }, session: session(quizCard) });
    renderWithProviders(<Quiz />);
    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.getByText("bus")).toBeInTheDocument());
    expect(mockApiFetch.mock.calls[1][0]).toBe("/api/quiz/session/slot-1/introduction");
    const request = JSON.parse(mockApiFetch.mock.calls[1][1].body);
    expect(request.cardId).toBe("card-intro");
    expect(request.expectedVersion).toBe(0);
    expect(request.submissionId).toBeTruthy();
  });

  it("keeps the current card and retries a failed command with the same submission id", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ session: session(introCard) })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ feedback: { type: "INTRODUCED" }, session: session(quizCard) });
    renderWithProviders(<Quiz />);

    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));

    expect(await screen.findByText("Couldn’t save that turn. Your answer has not been lost.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeEnabled();
    const firstCommand = JSON.parse(mockApiFetch.mock.calls[1][1].body);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("bus")).toBeInTheDocument());
    const retryCommand = JSON.parse(mockApiFetch.mock.calls[2][1].body);
    expect(mockApiFetch.mock.calls[2][0]).toBe(mockApiFetch.mock.calls[1][0]);
    expect(retryCommand).toEqual(firstCommand);
    expect(retryCommand.submissionId).toBeTruthy();
  });

  it("replaces stale local state with the authoritative conflict snapshot", async () => {
    const advancedSession = { ...session(quizCard), version: 4 };
    mockApiFetch
      .mockResolvedValueOnce({ session: session(introCard) })
      .mockRejectedValueOnce(new ApiError(409, { code: "SESSION_ADVANCED", session: advancedSession }));
    renderWithProviders(<Quiz />);

    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));

    expect(await screen.findByText("bus")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t save that turn. Your answer has not been lost.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("uses neutral feedback for a missed learning step", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ session: session(quizCard) })
      .mockResolvedValueOnce({
        feedback: { type: "NOT_YET", correctAnswer: "train", explanation: "電 and 車 combine directly.", kanjiBreakdown: quizCard.kanjiBreakdown },
        session: { ...session(quizCard), version: 2 },
      });
    renderWithProviders(<Quiz />);
    await userEvent.click(await screen.findByRole("button", { name: "bus" }));
    expect(await screen.findByText("Not yet")).toBeInTheDocument();
    expect(screen.getByLabelText("電車, でんしゃ, train")).toBeInTheDocument();
    expect(screen.getByText("電 and 車 combine directly.")).toBeInTheDocument();
    expect(screen.queryByText("Answer:")).not.toBeInTheDocument();
    expect(screen.queryByText("electricity")).not.toBeInTheDocument();
  });

  it("renders the server-derived summary when complete", async () => {
    mockApiFetch.mockResolvedValue({ session: { ...session(null, "COMPLETED"), summary: { newWordsLearned: 1, reintroducedWordsLearned: 0, reviewsCorrect: 3, toRevisit: 1 } } });
    renderWithProviders(<Quiz />);
    expect(await screen.findByText("Good work today")).toBeInTheDocument();
    expect(screen.getByText("new words learned")).toBeInTheDocument();
    expect(screen.getByText("reviews correct")).toBeInTheDocument();
  });
});
