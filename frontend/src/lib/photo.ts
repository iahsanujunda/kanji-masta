export interface ExampleWord {
  word: string;
  reading: string;
  meaning: string;
}

export interface EnrichedKanji {
  kanjiMasterId: string | null;
  character: string;
  recommended: boolean;
  whyUseful: string;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  frequency: number | null;
  exampleWords: ExampleWord[];
}

export type PhotoSessionStatus = "processing" | "done" | "failed" | "ingested";

export interface PhotoSessionResult {
  sessionId: string;
  status: PhotoSessionStatus;
  kanji?: EnrichedKanji[];
  failureCode?: string | null;
  storagePath?: string | null;
}

export interface RecentScanItem {
  sessionId: string;
  storagePath: string | null;
  status: PhotoSessionStatus;
  createdAt: string;
  kanjiCount: number | null;
  failureCode?: string | null;
}

export interface PhotoActivityItem extends RecentScanItem {
  updatedAt: string;
  taskType?: "VISUAL_ANALYSIS" | "TRANSLATION" | "CAPTURE_WORD_DISCOVERY" | null;
  taskStatus?: "pending" | "processing" | "done" | "failed" | null;
}

export interface PhotoActivityPage {
  items: PhotoActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PhotoActivityUnseen {
  hasUnseen: boolean;
  latestTerminalAt: string | null;
}

export type CaptureSort = "recent" | "familiarity" | "visited";
export type SortDirection = "asc" | "desc";

export interface CaptureSummary {
  sessionId: string;
  label: string;
  storagePath: string | null;
  status: "processing" | "ready" | "needs_attention";
  createdAt: string;
  readyAt: string | null;
  lastRevisitedAt: string | null;
  familiarKanji: number;
  totalKanji: number;
  coveragePercent: number | null;
  translationAvailable: boolean;
}

export interface CaptureListResponse {
  captures: CaptureSummary[];
}

export interface CaptureKanjiItem {
  kanjiMasterId: string;
  character: string;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  whyUseful: string;
  familiarity: number | null;
  learningState: "FAMILIAR" | "LEARNING" | "NOT_STARTED" | "EXCLUDED";
  selectable: boolean;
  recommendedNext: boolean;
  excluded: boolean;
}

export interface CaptureDetail extends Omit<CaptureSummary, "readyAt" | "lastRevisitedAt" | "translationAvailable"> {
  failureCode: string | null;
  fullText: string | null;
  translation: string | null;
  translationLanguage: string;
  batchGateSatisfied: boolean;
  kanji: CaptureKanjiItem[];
  tasks: CaptureTaskState[];
  wordDiscovery: CaptureWordDiscovery;
}

export interface CaptureTaskState {
  taskType: "VISUAL_ANALYSIS" | "TRANSLATION";
  status: "blocked" | "pending" | "processing" | "failed" | "done";
  failureCode: string | null;
}

export interface CaptureWordDiscovery {
  eligible: boolean;
  status: "LOCKED" | "NOT_STARTED" | "PENDING" | "PROCESSING" | "FAILED" | "DONE";
  failureCode: string | null;
  newCount: number;
  learningCount: number;
  familiarCount: number;
  candidates: CaptureWordCandidate[];
}

export interface CaptureWordCandidate {
  candidateId: string;
  surfaceText: string;
  lemma: string;
  reading: string;
  meaning: string;
  kanjiMasterIds: string[];
  learningState: "NEW" | "LEARNING" | "FAMILIAR";
  familiarity: number | null;
}
