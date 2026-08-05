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
