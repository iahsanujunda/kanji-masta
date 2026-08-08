import { describe, expect, it } from "vitest";
import {
  eligibleRecommendationSelection,
  nextVisibleRecommendationCount,
  recommendationCandidates,
  toggleRecommendationSelection,
} from "@/lib/captureKanjiRecommendations";
import type { CaptureKanjiItem } from "@/lib/photo";

function item(
  id: string,
  overrides: Partial<CaptureKanjiItem> = {},
): CaptureKanjiItem {
  return {
    kanjiMasterId: id,
    character: id,
    onyomi: [],
    kunyomi: [],
    meanings: [],
    whyUseful: "",
    familiarity: null,
    learningState: "NOT_STARTED",
    selectable: true,
    recommendedNext: false,
    excluded: false,
    ...overrides,
  };
}

describe("capture kanji recommendations", () => {
  it("keeps every selectable not-started kanji in the server's ranking order", () => {
    const candidates = recommendationCandidates([
      item("familiar", { selectable: false, familiarity: 5, learningState: "FAMILIAR" }),
      item("first"),
      item("learning", { selectable: false, familiarity: 2, learningState: "LEARNING" }),
      item("second"),
      item("excluded", { selectable: false, excluded: true, learningState: "EXCLUDED" }),
      item("third"),
    ]);

    expect(candidates.map((candidate) => candidate.kanjiMasterId)).toEqual(["first", "second", "third"]);
  });

  it("reveals three more candidates without exceeding the available count", () => {
    expect(nextVisibleRecommendationCount(3, 8)).toBe(6);
    expect(nextVisibleRecommendationCount(6, 8)).toBe(8);
    expect(nextVisibleRecommendationCount(8, 8)).toBe(8);
  });

  it("allows deselection but caps new selections at three", () => {
    let selected = new Set(["one", "two", "three"]);
    selected = toggleRecommendationSelection(selected, "four");
    expect([...selected]).toEqual(["one", "two", "three"]);

    selected = toggleRecommendationSelection(selected, "two");
    selected = toggleRecommendationSelection(selected, "four");
    expect([...selected]).toEqual(["one", "three", "four"]);
  });

  it("drops selections that are no longer eligible after a refetch", () => {
    const selected = eligibleRecommendationSelection(
      new Set(["still-new", "became-learning"]),
      [item("still-new"), item("another")],
    );

    expect([...selected]).toEqual(["still-new"]);
  });
});
