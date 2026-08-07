import { apiFetch } from "@/lib/api";
import type {
  AdminStatusData,
  CatalogModel,
  CostData,
  InviteItem,
  JobDetailData,
  JobsData,
  ModelConfig,
} from "@/pages/admin/types";

export const adminApi = {
  status: (signal?: AbortSignal) => apiFetch<AdminStatusData>("/api/admin/status", { signal }),
  cost: (signal?: AbortSignal) => apiFetch<CostData>("/api/admin/cost", { signal }),
  jobs: (filter: string, signal?: AbortSignal) =>
    apiFetch<JobsData>(`/api/admin/jobs${filter === "all" ? "" : `?status=${filter}`}`, { signal }),
  job: (type: string, id: string, signal?: AbortSignal) =>
    apiFetch<JobDetailData>(`/api/admin/jobs/${type}/${id}`, { signal }),
  failJob: (type: string, id: string) =>
    apiFetch(`/api/admin/jobs/${type}/${id}/fail`, { method: "POST" }),
  rerunJob: (type: string, id: string) =>
    apiFetch(`/api/admin/jobs/${type}/${id}/rerun`, { method: "POST" }),
  modelConfigs: (signal?: AbortSignal) =>
    apiFetch<{ configs: ModelConfig[] }>("/api/admin/model-config", { signal }),
  models: (workload: string, query: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ workload });
    if (query.trim()) params.set("q", query.trim());
    return apiFetch<{ models: CatalogModel[] }>(`/api/admin/models?${params}`, { signal });
  },
  saveModelConfig: (body: {
    photoAnalysisModel: string;
    photoAnalysisReasoning: string;
    quizGenerationModel: string;
    quizGenerationReasoning: string;
    wordDiscoveryModel: string;
    wordDiscoveryReasoning: string;
    translationModel: string;
    translationReasoning: string;
  }) =>
    apiFetch<ModelConfig>("/api/admin/model-config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  invites: (signal?: AbortSignal) =>
    apiFetch<{ invites: InviteItem[] }>("/api/admin/invites", { signal }),
  createInvite: (email: string, sendEmail: boolean) =>
    apiFetch("/api/admin/invite", { method: "POST", body: JSON.stringify({ email, sendEmail }) }),
  revokeInvite: (id: string) =>
    apiFetch(`/api/admin/invite/${id}/revoke`, { method: "PUT" }),
};
