import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Quiz from "../Quiz";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockSlotResponse = {
  quizzes: [
    {
      id: "q1",
      quizType: "MEANING_RECALL",
      word: "電車",
      wordReading: "でんしゃ",
      prompt: "電車",
      target: "電車",
      furigana: null,
      answer: "train",
      options: ["bus", "train", "taxi", "subway"],
      explanation: "電車 means train",
      wordFamiliarity: 0,
      currentTier: "MEANING_RECALL",
    },
    {
      id: "q2",
      quizType: "READING_RECOGNITION",
      word: "電話",
      wordReading: "でんわ",
      prompt: "電話",
      target: "電話",
      furigana: null,
      answer: "でんわ",
      options: ["でんわ", "でんき", "でんち", "でんしゃ"],
      explanation: "電話 is read でんわ",
      wordFamiliarity: 1,
      currentTier: "READING_RECOGNITION",
    },
  ],
  remaining: 2,
  slotEndsAt: null,
};

describe("Quiz", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("shows loading state initially", () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<Quiz />);
    expect(screen.getByText("Loading quizzes...")).toBeInTheDocument();
  });

  it("renders quiz prompt after loading", async () => {
    mockApiFetch.mockResolvedValue(mockSlotResponse);
    renderWithProviders(<Quiz />);

    await waitFor(() => {
      expect(screen.getByText("電車")).toBeInTheDocument();
    });
  });

  it("shows options as buttons", async () => {
    mockApiFetch.mockResolvedValue(mockSlotResponse);
    renderWithProviders(<Quiz />);

    await waitFor(() => {
      expect(screen.getByText("bus")).toBeInTheDocument();
      expect(screen.getByText("train")).toBeInTheDocument();
      expect(screen.getByText("taxi")).toBeInTheDocument();
      expect(screen.getByText("subway")).toBeInTheDocument();
    });
  });

  it("shows feedback after answering correctly", async () => {
    mockApiFetch
      .mockResolvedValueOnce(mockSlotResponse) // GET /api/quiz/slot
      .mockResolvedValue({ remaining: 1, correct: true, newFamiliarity: 1 }); // POST /api/quiz/result

    renderWithProviders(<Quiz />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("train")).toBeInTheDocument();
    });

    await user.click(screen.getByText("train"));

    await waitFor(() => {
      expect(screen.getByText("Correct!")).toBeInTheDocument();
      expect(screen.getByText("電車 means train")).toBeInTheDocument();
    });
  });

  it("shows feedback after answering incorrectly", async () => {
    mockApiFetch
      .mockResolvedValueOnce(mockSlotResponse)
      .mockResolvedValue({ remaining: 1, correct: false, newFamiliarity: 0 });

    renderWithProviders(<Quiz />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("bus")).toBeInTheDocument();
    });

    await user.click(screen.getByText("bus"));

    await waitFor(() => {
      expect(screen.getByText("Not quite.")).toBeInTheDocument();
    });
  });

  it("shows completion screen when no quizzes", async () => {
    mockApiFetch.mockResolvedValue({ quizzes: [], remaining: 0, slotEndsAt: null });
    renderWithProviders(<Quiz />);

    await waitFor(() => {
      expect(screen.getByText("Slot Complete!")).toBeInTheDocument();
    });
  });
});
