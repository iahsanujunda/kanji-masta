import type { CatalogModel, ModelConfig } from "@/pages/admin/types";

export type Workload = "photo_analysis" | "translation" | "quiz_generation" | "word_discovery";
export type ModelDraft = {
  photoAnalysisModel: string;
  photoAnalysisReasoning: string;
  translationModel: string;
  translationReasoning: string;
  quizGenerationModel: string;
  quizGenerationReasoning: string;
  wordDiscoveryModel: string;
  wordDiscoveryReasoning: string;
};

type WorkloadDefinition = {
  label: string;
  modelKey: keyof Pick<ModelDraft, "photoAnalysisModel" | "translationModel" | "quizGenerationModel" | "wordDiscoveryModel">;
  reasoningKey: keyof Pick<ModelDraft, "photoAnalysisReasoning" | "translationReasoning" | "quizGenerationReasoning" | "wordDiscoveryReasoning">;
  requiresImage: boolean;
};

export const WORKLOADS: Record<Workload, WorkloadDefinition> = {
  photo_analysis: { label: "Photo analysis", modelKey: "photoAnalysisModel", reasoningKey: "photoAnalysisReasoning", requiresImage: true },
  translation: { label: "Capture translation", modelKey: "translationModel", reasoningKey: "translationReasoning", requiresImage: false },
  quiz_generation: { label: "Quiz generation", modelKey: "quizGenerationModel", reasoningKey: "quizGenerationReasoning", requiresImage: false },
  word_discovery: { label: "Word discovery", modelKey: "wordDiscoveryModel", reasoningKey: "wordDiscoveryReasoning", requiresImage: false },
};

export const WORKLOAD_ORDER = Object.keys(WORKLOADS) as Workload[];
export const REASONING_ORDER = ["max", "xhigh", "high", "medium", "low", "minimal", "none"] as const;

export function supportedReasoningEfforts(model: CatalogModel): string[] {
  const advertised = new Set(model.reasoningEfforts ?? []);
  return REASONING_ORDER.filter((effort) => advertised.has(effort));
}

export function draftFromConfig(source?: ModelConfig): ModelDraft {
  return source ? {
    photoAnalysisModel: source.photoAnalysisModel,
    photoAnalysisReasoning: source.photoAnalysisReasoning,
    translationModel: source.translationModel ?? source.wordDiscoveryModel,
    translationReasoning: source.translationReasoning ?? source.wordDiscoveryReasoning,
    quizGenerationModel: source.quizGenerationModel,
    quizGenerationReasoning: source.quizGenerationReasoning,
    wordDiscoveryModel: source.wordDiscoveryModel,
    wordDiscoveryReasoning: source.wordDiscoveryReasoning,
  } : {
    photoAnalysisModel: "",
    photoAnalysisReasoning: "",
    translationModel: "",
    translationReasoning: "",
    quizGenerationModel: "",
    quizGenerationReasoning: "",
    wordDiscoveryModel: "",
    wordDiscoveryReasoning: "",
  };
}

export function selectModel(draft: ModelDraft, workload: Workload, model: CatalogModel): ModelDraft {
  const definition = WORKLOADS[workload];
  const currentReasoning = draft[definition.reasoningKey];
  const reasoningEfforts = supportedReasoningEfforts(model);
  return {
    ...draft,
    [definition.modelKey]: model.id,
    [definition.reasoningKey]: reasoningEfforts.includes(currentReasoning) ? currentReasoning : "",
  };
}

export function selectReasoning(draft: ModelDraft, workload: Workload, reasoningEffort: string): ModelDraft {
  return { ...draft, [WORKLOADS[workload].reasoningKey]: reasoningEffort };
}

export function isCompleteDraft(draft: ModelDraft): boolean {
  return Object.values(draft).every(Boolean);
}

export function isChangedDraft(draft: ModelDraft, source?: ModelConfig): boolean {
  if (!source) return true;
  const original = draftFromConfig(source);
  return (Object.keys(draft) as Array<keyof ModelDraft>).some((key) => draft[key] !== original[key]);
}
