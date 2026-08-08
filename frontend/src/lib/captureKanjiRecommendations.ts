import type { CaptureKanjiItem } from "@/lib/photo";

export const RECOMMENDATION_PAGE_SIZE = 3;
export const MAX_RECOMMENDATION_SELECTIONS = 3;

export function recommendationCandidates(items: CaptureKanjiItem[]): CaptureKanjiItem[] {
  return items.filter((item) => item.selectable && !item.excluded && item.learningState === "NOT_STARTED");
}

export function nextVisibleRecommendationCount(currentCount: number, totalCount: number): number {
  return Math.min(Math.max(currentCount, RECOMMENDATION_PAGE_SIZE) + RECOMMENDATION_PAGE_SIZE, totalCount);
}

export function eligibleRecommendationSelection(
  selectedIds: ReadonlySet<string>,
  candidates: CaptureKanjiItem[],
): Set<string> {
  const candidateIds = new Set(candidates.map((item) => item.kanjiMasterId));
  return new Set([...selectedIds].filter((id) => candidateIds.has(id)));
}

export function toggleRecommendationSelection(
  selectedIds: ReadonlySet<string>,
  kanjiMasterId: string,
  maximum = MAX_RECOMMENDATION_SELECTIONS,
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(kanjiMasterId)) {
    next.delete(kanjiMasterId);
  } else if (next.size < maximum) {
    next.add(kanjiMasterId);
  }
  return next;
}
