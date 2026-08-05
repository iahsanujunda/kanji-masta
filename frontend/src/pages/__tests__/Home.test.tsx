import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import Home from "../Home";
import { renderWithProviders } from "@/test/mocks";
import { deleteLocalCapturesForUser, saveLocalCapture } from "@/lib/captureQueue";

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
  beforeEach(async () => {
    mockApiFetch.mockReset();
    await deleteLocalCapturesForUser("test-user");
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

  it.each([
    ["processing", "Analysing your photo"],
    ["done", "Scan ready"],
    ["failed", "Scan needs attention"],
  ] as const)("places the %s scan directly below the top quiz card", async (status, scanTitle) => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/recent") {
        return Promise.resolve({ sessions: [{
          sessionId: `scan-${status}`,
          storagePath: null,
          status,
          createdAt: new Date().toISOString(),
          kanjiCount: status === "done" ? 4 : null,
        }] });
      }
      return Promise.resolve(activeSummary);
    });
    renderWithProviders(<Home />);

    const quiz = await screen.findByText("Session Active");
    const scan = await screen.findByRole("button", { name: new RegExp(scanTitle) });
    const lesson = screen.getByText("Today's Lesson");
    expect(quiz.compareDocumentPosition(scan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scan.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Recent Scans")).not.toBeInTheDocument();
  });

  it("shows the active server scan once while retaining older recent scans", async () => {
    const now = Date.now();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/recent") {
        return Promise.resolve({ sessions: [
          {
            sessionId: "active-processing",
            storagePath: null,
            status: "processing",
            createdAt: new Date(now).toISOString(),
            kanjiCount: null,
          },
          {
            sessionId: "older-done",
            storagePath: null,
            status: "done",
            createdAt: new Date(now - 60_000).toISOString(),
            kanjiCount: 3,
          },
        ] });
      }
      return Promise.resolve(activeSummary);
    });

    renderWithProviders(<Home />);

    expect(await screen.findByRole("button", { name: /Analysing your photo/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Analysing/)).toHaveLength(1);
    expect(screen.getByText("Recent Scans")).toBeInTheDocument();
    expect(screen.getByText("3 kanji found")).toBeInTheDocument();
  });

  it("keeps the quiz first and links to queue management when multiple photos are saved", async () => {
    for (let index = 0; index < 2; index += 1) {
      const id = `home-queued-${index}`;
      const blob = new Blob([`photo-${index}`], { type: "image/jpeg" });
      await saveLocalCapture({
        id,
        userId: "test-user",
        blob,
        byteSize: blob.size,
        storagePath: `test-user/${id}.jpg`,
        status: "pending",
        attempts: 0,
        createdAt: new Date(Date.now() + index).toISOString(),
      });
    }
    mockApiFetch.mockImplementation((path: string) =>
      path === "/api/photo/recent" ? Promise.resolve({ sessions: [] }) : Promise.resolve(activeSummary),
    );

    renderWithProviders(<Home />);

    const quiz = await screen.findByText("Session Active");
    const activeScan = await screen.findByRole("button", { name: /Waiting to upload/ });
    const manageQueue = screen.getByRole("button", { name: /View all 2 saved photos/ });
    const lesson = screen.getByText("Today's Lesson");
    expect(quiz.compareDocumentPosition(activeScan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(activeScan.compareDocumentPosition(manageQueue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(manageQueue.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
