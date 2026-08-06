import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "../Home";
import { mockUser, renderWithProviders } from "@/test/mocks";
import { deleteLocalCapturesForUser, saveLocalCapture } from "@/lib/captureQueue";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const homeUser = { ...mockUser, id: "home-test-user" };
const renderHome = () => renderWithProviders(<Home />, { authUser: homeUser });

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
    await deleteLocalCapturesForUser(homeUser.id);
  });

  it("shows zero state when no words", async () => {
    mockApiFetch.mockResolvedValue(emptySummary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText("Plant Your First Seeds")).toBeInTheDocument();
    });
  });

  it("shows active slot with remaining count", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("remaining")).toBeInTheDocument();
    });
  });

  it("shows streak count", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("shows kanji counts", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText(/10 learning/)).toBeInTheDocument();
      expect(screen.getByText(/5 familiar/)).toBeInTheDocument();
    });
  });

  it("shows word count in dictionary card", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText("25 saved words")).toBeInTheDocument();
    });
  });

  it("offers a gallery entry without duplicating capture processing state", async () => {
    mockApiFetch.mockResolvedValue(activeSummary);
    renderHome();

    expect(await screen.findByText("Captures")).toBeInTheDocument();
    expect(screen.getByText("Revisit photos, translations, and kanji")).toBeInTheDocument();
    expect(screen.queryByText("Analysing your photo")).not.toBeInTheDocument();
  });

  it("shows a ready session when the collection has content even if onboarding state is stale", async () => {
    mockApiFetch.mockResolvedValue(populatedCollectionWithStaleOnboarding);
    renderHome();

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
    renderHome();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your progress");
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(screen.queryByText("Plant Your First Seeds")).not.toBeInTheDocument();
      expect(screen.queryByText("0 learning")).not.toBeInTheDocument();
      expect(screen.queryByText("0 familiar")).not.toBeInTheDocument();
      expect(screen.queryByText("0 saved words")).not.toBeInTheDocument();
    }, { timeout: 2500 });
  });

  it("keeps scan status out of Home and exposes unseen updates through Activity", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: true, latestTerminalAt: "2026-08-05T05:10:00Z" });
      return Promise.resolve(activeSummary);
    });
    renderHome();

    expect(await screen.findByRole("button", { name: "Activity, new updates" })).toBeInTheDocument();
    expect(screen.queryByText("Analysing your photo")).not.toBeInTheDocument();
    expect(screen.queryByText("Scan ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Scan needs attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Scans")).not.toBeInTheDocument();
  });

  it("keeps saved photos out of Home and reveals them inside Activity", async () => {
    const user = userEvent.setup();
    for (let index = 0; index < 2; index += 1) {
      const id = `home-queued-${index}`;
      const blob = new Blob([`photo-${index}`], { type: "image/jpeg" });
      await saveLocalCapture({
        id,
        userId: homeUser.id,
        blob,
        byteSize: blob.size,
        storagePath: `${homeUser.id}/${id}.jpg`,
        status: "pending",
        attempts: 0,
        createdAt: new Date(Date.now() + index).toISOString(),
      });
    }
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/photo/activity/unseen") return Promise.resolve({ hasUnseen: false, latestTerminalAt: null });
      if (path === "/api/photo/activity?limit=20") return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
      return Promise.resolve(activeSummary);
    });

    renderHome();

    expect(await screen.findByText("Session Active")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting to upload")[0]).not.toBeVisible();
    expect(screen.queryByRole("button", { name: /View all 2 saved photos/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findAllByText("Waiting to upload")).toHaveLength(2);
  });
});
