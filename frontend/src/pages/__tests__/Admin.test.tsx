import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admin from "../Admin";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const job = {
  id: "photo-1",
  type: "photo_analysis",
  status: "processing",
  stale: false,
  attempts: 1,
  maxAttempts: 3,
  userId: "user-123456789",
  summary: "Photo analysis",
  costMicrodollars: null,
  createdAt: "2026-08-05T00:00:00Z",
  updatedAt: "2026-08-05T00:01:00Z",
};

function installApi() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/admin/status") return Promise.resolve({ status: "down", checkedAt: new Date().toISOString() });
    if (path.startsWith("/api/admin/jobs/photo_analysis/photo-1")) return Promise.resolve({ job, attempts: [{ id: "attempt-1", attemptNumber: 1, status: "processing", trigger: "initial", createdBy: "system", createdAt: job.createdAt }] });
    if (path.startsWith("/api/admin/jobs")) return Promise.resolve({ jobs: [job, { ...job, id: "quiz-1", type: "quiz_generation", status: "done", summary: "Quiz generation · 駅" }], counts: { pending: 0, processing: 1, done: 1, failed: 0 } });
    if (path === "/api/admin/model-config") return Promise.resolve({ configs: [{ version: 1, status: "active", validationStatus: "passed", photoAnalysisModel: "vision/current", quizGenerationModel: "text/current", wordDiscoveryModel: "text/current", createdAt: job.createdAt }] });
    if (path.startsWith("/api/admin/models")) return Promise.resolve({ models: [{ id: "qwen/qwen-vision", canonicalSlug: "qwen/qwen-vision", name: "Qwen Vision", inputModalities: ["text", "image"], outputModalities: ["text"], supportedParameters: ["structured_outputs"] }] });
    if (path === "/api/admin/invites") return Promise.resolve({ invites: [] });
    if (path === "/api/admin/cost") return Promise.resolve({ totalMicrodollars: 0, totalDollars: "0.00", byUser: [], byDay: [] });
    return Promise.resolve({});
  });
}

describe("Admin control plane", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    installApi();
  });

  it("uses real system status and renders every durable job state as mobile cards", async () => {
    renderWithProviders(<Admin />);

    expect(await screen.findByText("System down")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "View Photo analysis job photo-1" })).toBeInTheDocument();
    expect(screen.getByText("Quiz generation · 駅")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin sections" })).toBeInTheDocument();
  });

  it("opens job actions through the shared animated bottom drawer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(await screen.findByRole("button", { name: "View Photo analysis job photo-1" }));

    const drawer = await screen.findByRole("dialog", { name: "Job details" });
    expect(drawer).toHaveAttribute("data-admin-drawer", "true");
    expect(drawer).toHaveStyle({ transitionDuration: "300ms" });
    expect(await within(drawer).findByText("#1 · processing")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Mark failed" })).toBeInTheDocument();
  });

  it("keeps model search behind the admin API and waits for two characters", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(await screen.findByRole("button", { name: "Change Photo analysis model" }));
    const input = await screen.findByRole("textbox", { name: "Search OpenRouter models" });
    await user.type(input, "q");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(mockApiFetch.mock.calls.filter(([path]) => String(path).includes("q=q"))).toHaveLength(0);

    await user.type(input, "w");
    await waitFor(() => expect(mockApiFetch.mock.calls.some(([path]) => String(path).includes("q=qw"))).toBe(true), { timeout: 900 });
    expect(await screen.findByText("Qwen Vision")).toBeInTheDocument();
    expect(mockApiFetch.mock.calls.some(([path]) => String(path).includes("openrouter.ai"))).toBe(false);
  });

  it("uses the same bottom drawer for invite creation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByRole("button", { name: "Invites" }));
    await user.click(await screen.findByRole("button", { name: "Create invite" }));
    expect(await screen.findByRole("dialog", { name: "Create invite" })).toHaveAttribute("data-admin-drawer", "true");
    expect(screen.queryByRole("dialog", { name: "Send Direct Invite" })).not.toBeInTheDocument();
  });
});
