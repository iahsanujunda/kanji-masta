export interface Lesson {
  id: string;
  title: string;
  readTime: string;
  teaser: string;
  accentColor: string;
  accentBg: string;
}

export const LESSONS: Lesson[] = [
  {
    id: "illusion-of-flashcards",
    title: "The Illusion of Flashcards",
    readTime: "2 MIN",
    teaser: "Our brain is not built for repeating a single character and hoping it sticks.",
    accentColor: "#10b981",
    accentBg: "rgba(16,185,129,0.1)",
  },
];

export function getTodayLesson(): Lesson {
  return LESSONS[0];
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
