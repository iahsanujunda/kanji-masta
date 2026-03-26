import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import Home from "../Home";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const emptySummary = {
  kanjiLearning: 0,
  kanjiFamiliar: 0,
  wordCount: 0,
  streak: 0,
  slotRemaining: 5,
  slotTotal: 5,
  slotEndsAt: null,
  onboardingComplete: false,
};

const activeSummary = {
  kanjiLearning: 10,
  kanjiFamiliar: 5,
  wordCount: 25,
  streak: 7,
  slotRemaining: 3,
  slotTotal: 5,
  slotEndsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  onboardingComplete: true,
};

describe("Home", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("shows zero state when no words", async () => {
    mockApiFetch.mockResolvedValue(emptySummary);
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText("Plant Your First Seeds")).toBeInTheDocument();
    });
  });

  it("shows active slot with remaining count", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("remaining")).toBeInTheDocument();
    });
  });

  it("shows streak count", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("shows kanji counts", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText(/10 learning/)).toBeInTheDocument();
      expect(screen.getByText(/5 familiar/)).toBeInTheDocument();
    });
  });

  it("shows word count in dictionary card", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText("25 words learned")).toBeInTheDocument();
    });
  });
});
