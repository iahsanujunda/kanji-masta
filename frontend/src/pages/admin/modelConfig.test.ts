import { describe, expect, it } from "vitest";
import {
  draftFromConfig,
  isCompleteDraft,
  selectModel,
  selectReasoning,
  supportedReasoningEfforts,
} from "@/pages/admin/modelConfig";
import type { CatalogModel } from "@/pages/admin/types";

const model = (id: string, reasoningEfforts: string[]): CatalogModel => ({
  id,
  canonicalSlug: id,
  name: id,
  inputModalities: ["text"],
  outputModalities: ["text"],
  supportedParameters: ["structured_outputs", "reasoning"],
  reasoningEfforts,
});

describe("model configuration state", () => {
  it("orders and limits reasoning to known model-advertised levels", () => {
    expect(supportedReasoningEfforts(model("deepseek/v4", ["low", "max", "high", "future"])))
      .toEqual(["max", "high", "low"]);
  });

  it("preserves a reasoning choice supported by the replacement model", () => {
    const draft = { ...draftFromConfig(), photoAnalysisModel: "vision/old", photoAnalysisReasoning: "medium" };

    const next = selectModel(draft, "photo_analysis", model("vision/new", ["high", "medium"]));

    expect(next.photoAnalysisModel).toBe("vision/new");
    expect(next.photoAnalysisReasoning).toBe("medium");
  });

  it("clears incompatible reasoning until the admin chooses a supported level", () => {
    const draft = { ...draftFromConfig(), quizGenerationModel: "text/old", quizGenerationReasoning: "medium" };
    const selected = selectModel(draft, "quiz_generation", model("deepseek/v4", ["max", "high", "low"]));

    expect(selected.quizGenerationReasoning).toBe("");
    expect(isCompleteDraft(selected)).toBe(false);
    expect(selectReasoning(selected, "quiz_generation", "high").quizGenerationReasoning).toBe("high");
  });
});
