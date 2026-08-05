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

const populatedCollectionWithStaleOnboarding = {
  kanjiLearning: 28,
  kanjiFamiliar: 107,
  wordCount: 107,
  streak: 0,
  slotRemaining: 5,
  slotTotal: 5,
  slotEndsAt: null,
  sessionState: "READY",
  onboardingComplete: false,
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
      expect(screen.getByText("25 saved words")).toBeInTheDocument();
    });
  });

  it("shows a ready session when the collection has content even if onboarding state is stale", async () => {
    mockApiFetch.mockResolvedValue(populatedCollectionWithStaleOnboarding);
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText("28 learning")).toBeInTheDocument();
      expect(screen.getByText("107 familiar")).toBeInTheDocument();
      expect(screen.getByText("107 saved words")).toBeInTheDocument();
      expect(screen.getByText("Ready to quiz")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start Session" })).toBeInTheDocument();
      expect(screen.queryByText("Plant Your First Seeds")).not.toBeInTheDocument();
    });
  });

  it("shows a retryable error instead of an empty collection when the summary request fails", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/user/summary") return Promise.reject(new Error("Internal Server Error"));
      return Promise.resolve({ sessions: [] });
    });
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your progress");
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(screen.queryByText("Plant Your First Seeds")).not.toBeInTheDocument();
      expect(screen.queryByText("0 learning")).not.toBeInTheDocument();
      expect(screen.queryByText("0 familiar")).not.toBeInTheDocument();
      expect(screen.queryByText("0 saved words")).not.toBeInTheDocument();
    }, { timeout: 2500 });
  });

  it("places the actionable scan directly below the top quiz card", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/recent") {
        return Promise.resolve({ sessions: [{
          sessionId: "scan-ready",
          storagePath: null,
          status: "done",
          createdAt: new Date().toISOString(),
          kanjiCount: 4,
        }] });
      }
      return Promise.resolve(activeSummary);
    });
    renderWithProviders(<Home />);

    const quiz = await screen.findByText("Session Active");
    const scan = await screen.findByText("Scan ready");
    const lesson = screen.getByText("Today's Lesson");
    expect(quiz.compareDocumentPosition(scan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scan.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
