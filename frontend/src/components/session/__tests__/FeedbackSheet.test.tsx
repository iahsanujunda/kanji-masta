import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import FeedbackSheet from "@/components/session/FeedbackSheet";
import { feedbackMeaning } from "@/components/session/feedbackMeaning";
import type { SessionCard, SessionFeedback } from "@/lib/session";
import { renderWithProviders } from "@/test/mocks";

const card: SessionCard = {
  cardType: "QUIZ",
  cardId: "card-1",
  wordId: "word-1",
  word: "電車",
  reading: "でんしゃ",
  meaning: "train",
  kanjiBreakdown: [
    { character: "電", meaning: "electricity" },
    { character: "車", meaning: "vehicle" },
  ],
  introductionKind: null,
  exampleSentence: null,
  exampleContext: null,
  quizType: "MEANING_RECALL",
  learningStep: null,
  prompt: "電車",
  target: "電車",
  furigana: null,
  options: ["train", "bus", "taxi", "subway"],
  explanation: "電 and 車 combine directly.",
  wordFamiliarity: 0,
};

const feedback: SessionFeedback = {
  type: "CORRECT",
  correctAnswer: "railway train",
  explanation: "電 and 車 combine directly.",
  kanjiBreakdown: card.kanjiBreakdown,
};

describe("feedbackMeaning", () => {
  it.each(["MEANING_RECALL", "BOLD_WORD_MEANING"])("uses the generated answer for %s", (quizType) => {
    expect(feedbackMeaning({ ...card, quizType }, feedback)).toBe("railway train");
  });

  it.each(["READING_RECOGNITION", "REVERSE_READING", "FILL_IN_THE_BLANK"])("uses the canonical meaning for %s", (quizType) => {
    expect(feedbackMeaning({ ...card, quizType }, feedback)).toBe("train");
  });

  it("falls back safely and permits a missing meaning", () => {
    expect(feedbackMeaning(card, { ...feedback, correctAnswer: " " })).toBe("train");
    expect(feedbackMeaning({ ...card, meaning: " " }, { ...feedback, correctAnswer: null })).toBe("");
  });
});

describe("FeedbackSheet", () => {
  it("shows the identity and AI reasoning on a positive result", () => {
    renderWithProviders(<FeedbackSheet feedback={feedback} answeredCard={card} onContinue={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Correct!");
    expect(screen.getByLabelText("電車, でんしゃ, railway train")).toBeInTheDocument();
    expect(screen.getByText("Why it works")).toBeInTheDocument();
    expect(screen.getByText("電 and 車 combine directly.")).toBeInTheDocument();
    expect(screen.queryByText("Answer:")).not.toBeInTheDocument();
    expect(screen.queryByText("electricity")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });

  it("shows the same identity and reasoning structure on an incorrect result", () => {
    renderWithProviders(
      <FeedbackSheet
        feedback={{ ...feedback, type: "INCORRECT", explanation: "でん and しゃ supply the two readings." }}
        answeredCard={{ ...card, quizType: "READING_RECOGNITION" }}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByLabelText("電車, でんしゃ, train")).toBeInTheDocument();
    expect(screen.getByText("でん and しゃ supply the two readings.")).toBeInTheDocument();
    expect(screen.queryByText("electricity")).not.toBeInTheDocument();
  });

  it("uses fixed outcome copy only when neither response carries an explanation", () => {
    renderWithProviders(
      <FeedbackSheet
        feedback={{ ...feedback, type: "NOT_YET", explanation: null }}
        answeredCard={{ ...card, explanation: null }}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Next step")).toBeInTheDocument();
    expect(screen.getByText("No penalty. You’ll see this word again before the session ends.")).toBeInTheDocument();
    expect(screen.queryByText("Why it works")).not.toBeInTheDocument();
  });

  it("omits a blank meaning without leaving an empty identity segment", () => {
    renderWithProviders(
      <FeedbackSheet
        feedback={{ ...feedback, correctAnswer: null }}
        answeredCard={{ ...card, quizType: "READING_RECOGNITION", meaning: " " }}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "電車, でんしゃ" })).toHaveTextContent("電車·でんしゃ");
  });
});
