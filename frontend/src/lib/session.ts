export interface KanjiBreakdownItem {
  character: string;
  meaning: string;
}

export interface SessionCard {
  cardType: "INTRODUCTION" | "QUIZ";
  cardId: string;
  wordId: string;
  word: string;
  reading: string;
  meaning: string;
  kanjiBreakdown: KanjiBreakdownItem[];
  introductionKind: "NEW" | "REINTRODUCTION" | null;
  exampleSentence: string | null;
  exampleContext: string | null;
  quizType: string | null;
  learningStep: number | null;
  prompt: string | null;
  target: string | null;
  furigana: string | null;
  options: string[];
  explanation: string | null;
  wordFamiliarity: number;
}

export interface SessionSummary {
  newWordsLearned: number;
  reintroducedWordsLearned: number;
  reviewsCorrect: number;
  toRevisit: number;
}

export interface SessionSnapshot {
  slotId: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED" | "EXPIRED";
  version: number;
  slotEndsAt: string;
  currentCard: SessionCard | null;
  progress: { completed: number; allowance: number; remaining: number };
  summary: SessionSummary;
}

export interface SessionFeedback {
  type: "INTRODUCED" | "NOT_YET" | "REVISIT_LATER" | "LEARNED" | "INCORRECT" | "CORRECT";
  correctAnswer: string | null;
  explanation: string | null;
  kanjiBreakdown: KanjiBreakdownItem[];
}

export interface SessionResponse { session: SessionSnapshot }
export interface SessionCommandResponse { feedback: SessionFeedback; session: SessionSnapshot }
