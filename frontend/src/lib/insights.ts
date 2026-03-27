export interface Lesson {
  id: string;
  title: string;
  readTime: string;
  teaser: string;
  accentColor: string;
  accentBg: string;
  interactive: boolean;
}

export const LESSONS: Lesson[] = [
  {
    id: "illusion-of-flashcards",
    title: "The Illusion of Flashcards",
    readTime: "2 MIN",
    teaser: "Our brain is not built for repeating a single character and hoping it sticks.",
    accentColor: "#10b981",
    accentBg: "rgba(16,185,129,0.1)",
    interactive: true,
  },
  {
    id: "i-plus-one-rule",
    title: "The i+1 Rule",
    readTime: "3 MIN",
    teaser: "How Shuukan uses the kanji you already know to teach you the ones you don't.",
    accentColor: "#818cf8",
    accentBg: "rgba(129,140,248,0.1)",
    interactive: false,
  },
  {
    id: "spaced-repetition",
    title: "Why You Forget — and How to Stop It",
    readTime: "2 MIN",
    teaser: "The science of the forgetting curve, and why reviewing at exactly the right moment matters.",
    accentColor: "#a78bfa",
    accentBg: "rgba(167,139,250,0.1)",
    interactive: false,
  },
  {
    id: "context-over-isolation",
    title: "Context Is Everything",
    readTime: "2 MIN",
    teaser: "Why the sentence around a word matters as much as the word itself.",
    accentColor: "#34d399",
    accentBg: "rgba(52,211,153,0.08)",
    interactive: false,
  },
];

/** Returns today's lesson based on date rotation. */
export function getTodayLesson(): Lesson {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return LESSONS[dayIndex % LESSONS.length];
}

const STORAGE_KEY_PREFIX = "insight_completed_";

export function isLessonCompleted(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + id) === "true";
  } catch {
    return false;
  }
}

export function markLessonCompleted(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + id, "true");
  } catch {
    // ignore storage errors
  }
}
