import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Onboarding from "../Onboarding";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockBatch = {
  kanji: [
    {
      kanjiMasterId: "km1",
      character: "日",
      onyomi: ["ニチ"],
      kunyomi: ["ひ"],
      meanings: ["day", "sun"],
      jlpt: 5,
      frequency: 1,
      seenAs: { word: "日本", reading: "にほん", meaning: "Japan" },
    },
    {
      kanjiMasterId: "km2",
      character: "月",
      onyomi: ["ゲツ"],
      kunyomi: ["つき"],
      meanings: ["moon", "month"],
      jlpt: 5,
      frequency: 2,
      seenAs: null,
    },
  ],
  hasMore: true,
};

describe("Onboarding", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("renders kanji card with character and meaning", async () => {
    mockApiFetch.mockResolvedValue(mockBatch);
    renderWithProviders(<Onboarding />);

    await waitFor(() => {
      expect(screen.getByText("日")).toBeInTheDocument();
      expect(screen.getByText("day")).toBeInTheDocument();
    });
  });

  it("shows readings", async () => {
    mockApiFetch.mockResolvedValue(mockBatch);
    renderWithProviders(<Onboarding />);

    await waitFor(() => {
      expect(screen.getByText("ニチ")).toBeInTheDocument();
      expect(screen.getByText("ひ")).toBeInTheDocument();
    });
  });

  it("shows 'seen as' example when available", async () => {
    mockApiFetch.mockResolvedValue(mockBatch);
    renderWithProviders(<Onboarding />);

    await waitFor(() => {
      expect(screen.getByText("日本")).toBeInTheDocument();
      expect(screen.getByText("にほん")).toBeInTheDocument();
    });
  });

  it("advances to next card on 'Want to Learn'", async () => {
    mockApiFetch.mockResolvedValue(mockBatch);
    renderWithProviders(<Onboarding />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("日")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Want to Learn"));

    await waitFor(() => {
      expect(screen.getByText("月")).toBeInTheDocument();
    });
  });

  it("advances to next card on 'Already Know'", async () => {
    mockApiFetch.mockResolvedValue(mockBatch);
    renderWithProviders(<Onboarding />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("日")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Already Know"));

    await waitFor(() => {
      expect(screen.getByText("月")).toBeInTheDocument();
    });
  });

  it("shows batch-done screen after all cards", async () => {
    mockApiFetch.mockResolvedValue(mockBatch);
    renderWithProviders(<Onboarding />);
    const user = userEvent.setup();

    // Go through both cards
    await waitFor(() => screen.getByText("日"));
    await user.click(screen.getByText("Want to Learn"));
    await waitFor(() => screen.getByText("月"));
    await user.click(screen.getByText("Already Know"));

    await waitFor(() => {
      expect(screen.getByText(/2 kanji reviewed/)).toBeInTheDocument();
      expect(screen.getByText("Add another 10")).toBeInTheDocument();
      expect(screen.getByText("Start learning")).toBeInTheDocument();
    });
  });
});
