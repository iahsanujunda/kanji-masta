export const queryKeys = {
  userSummary: (userId: string) => ["user-summary", userId] as const,
  settings: (userId: string) => ["settings", userId] as const,
  kanjiList: (userId: string) => ["kanji-list", userId] as const,
  words: (userId: string, query: string, state: string) => ["words", userId, query, state] as const,
  wordReference: (userId: string, id: string | undefined) => ["word-reference", userId, id] as const,
  curriculum: (userId: string) => ["curriculum", userId] as const,
  curriculumDetail: (userId: string, jlpt: number) => ["curriculum-detail", userId, jlpt] as const,
  photoSession: (userId: string, sessionId: string | undefined) => ["photo-session", userId, sessionId] as const,
  signedPhoto: (userId: string, storagePath: string | undefined) => ["signed-photo", userId, storagePath] as const,
  captures: (userId: string, sort: string, direction: string) => ["captures", userId, sort, direction] as const,
  capture: (userId: string, sessionId: string | undefined) => ["capture", userId, sessionId] as const,
  quizSession: (userId: string) => ["quiz-session", userId, "active"] as const,
};
