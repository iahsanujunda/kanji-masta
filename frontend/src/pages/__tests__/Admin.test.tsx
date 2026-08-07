import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admin from "../Admin";
import { renderWithProviders } from "@/test/mocks";
import { ApiError } from "@/lib/api";

const mockApiFetch = vi.hoisted(() => vi.fn());
const mockModelSave = vi.hoisted(() => vi.fn());
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
const activeModelConfig = {
  version: 1,
  status: "active",
  validationStatus: "passed",
  photoAnalysisModel: "vision/current",
  photoAnalysisReasoning: "medium",
  quizGenerationModel: "text/current",
  quizGenerationReasoning: "high",
  wordDiscoveryModel: "text/current",
  wordDiscoveryReasoning: "medium",
  createdAt: job.createdAt,
};
let modelConfigs = [activeModelConfig];

function installApi() {
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === "/api/admin/status") return Promise.resolve({ status: "down", checkedAt: new Date().toISOString() });
    if (path.startsWith("/api/admin/jobs/photo_analysis/photo-1")) return Promise.resolve({ job, attempts: [{ id: "attempt-1", attemptNumber: 1, status: "processing", trigger: "initial", createdBy: "system", createdAt: job.createdAt }] });
    if (path.startsWith("/api/admin/jobs")) return Promise.resolve({ jobs: [job, { ...job, id: "quiz-1", type: "quiz_generation", status: "done", summary: "Quiz generation · 駅" }], counts: { pending: 0, processing: 1, done: 1, failed: 0 } });
    if (path === "/api/admin/model-config" && init?.method === "PUT") return mockModelSave(JSON.parse(String(init.body)));
    if (path === "/api/admin/model-config") return Promise.resolve({ configs: modelConfigs });
    if (path.startsWith("/api/admin/models")) return Promise.resolve({ models: [{ id: "qwen/qwen-vision", canonicalSlug: "qwen/qwen-vision", name: "Qwen Vision", inputModalities: ["text", "image"], outputModalities: ["text"], supportedParameters: ["structured_outputs", "reasoning"], reasoningEfforts: ["high", "medium", "low"], defaultReasoningEffort: "medium" }] });
    if (path === "/api/admin/invites") return Promise.resolve({ invites: [] });
    if (path === "/api/admin/cost") return Promise.resolve({ totalMicrodollars: 0, totalDollars: "0.00", byUser: [], byDay: [] });
    return Promise.resolve({});
  });
}

describe("Admin control plane", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockModelSave.mockReset();
    modelConfigs = [activeModelConfig];
    mockModelSave.mockResolvedValue({ ...activeModelConfig, version: 2, photoAnalysisModel: "qwen/qwen-vision", photoAnalysisReasoning: "low" });
    installApi();
  });

  it("uses real system status and renders every durable job state as mobile cards", async () => {
    renderWithProviders(<Admin />);

    expect(await screen.findByText("System down")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "View Photo analysis job photo-1" })).toBeInTheDocument();
    expect(screen.getByText("Quiz generation · 駅")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin sections" })).toBeInTheDocument();
  });

  it("puts the active model configuration before job controls", async () => {
    renderWithProviders(<Admin />);

    const modelSettings = await screen.findByText("Model settings");
    const firstJob = await screen.findByRole("button", { name: "View Photo analysis job photo-1" });

    expect(modelSettings.compareDocumentPosition(firstJob) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("vision/current")).toBeInTheDocument();
    expect(screen.getAllByText("text/current")).toHaveLength(3);
  });

  it("explains when no database model configuration is active", async () => {
    modelConfigs = [];

    renderWithProviders(<Admin />);

    expect(await screen.findByText("No active model configuration. Choose a model and reasoning level for all four workloads.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Change .* model/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
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
    expect(await screen.findByText("Image input · required")).toBeInTheDocument();
    const input = await screen.findByRole("textbox", { name: "Search OpenRouter models" });
    await user.type(input, "q");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(mockApiFetch.mock.calls.filter(([path]) => String(path).includes("q=q"))).toHaveLength(0);

    await user.type(input, "w");
    await waitFor(() => expect(mockApiFetch.mock.calls.some(([path]) => String(path).includes("q=qw"))).toBe(true), { timeout: 900 });
    expect(await screen.findByText("Qwen Vision")).toBeInTheDocument();
    expect(mockApiFetch.mock.calls.some(([path]) => String(path).includes("openrouter.ai"))).toBe(false);
  });

  it("submits changed models with progress and confirms success", async () => {
    let finishSave!: (value: unknown) => void;
    mockModelSave.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    const user = userEvent.setup();
    renderWithProviders(<Admin />);

    await user.click(await screen.findByRole("button", { name: "Change Photo analysis model" }));
    await user.click(await screen.findByRole("button", { name: /Qwen Vision/ }));
    expect(await screen.findByRole("dialog", { name: "Choose reasoning level" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /low/i }));
    const submit = screen.getByRole("button", { name: "Submit" });
    await user.click(submit);

    expect(within(submit).getByRole("progressbar")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    finishSave({ ...activeModelConfig, version: 2, photoAnalysisModel: "qwen/qwen-vision", photoAnalysisReasoning: "low" });

    expect(await screen.findByText("Model configuration saved.")).toBeInTheDocument();
    expect(screen.getByText("qwen/qwen-vision")).toBeInTheDocument();
    expect(mockModelSave).toHaveBeenCalledWith({
      photoAnalysisModel: "qwen/qwen-vision",
      photoAnalysisReasoning: "low",
      translationModel: "text/current",
      translationReasoning: "medium",
      quizGenerationModel: "text/current",
      quizGenerationReasoning: "high",
      wordDiscoveryModel: "text/current",
      wordDiscoveryReasoning: "medium",
    });
  });

  it("keeps rejected selections editable and reports validation failure", async () => {
    mockModelSave.mockRejectedValue(new ApiError(422, { error: "Model configuration rejected" }));
    const user = userEvent.setup();
    renderWithProviders(<Admin />);

    await user.click(await screen.findByRole("button", { name: "Change Photo analysis model" }));
    await user.click(await screen.findByRole("button", { name: /Qwen Vision/ }));
    await user.click(screen.getByRole("button", { name: /low/i }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("The selected models or reasoning levels are not valid.")).toBeInTheDocument();
    expect(screen.getByText("qwen/qwen-vision")).toBeInTheDocument();
    expect(screen.queryByText("Model configuration saved.")).not.toBeInTheDocument();
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
