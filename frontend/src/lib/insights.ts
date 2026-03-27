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
  {
    id: "wild-is-your-classroom",
    title: "The Wild is Your Classroom",
    readTime: "3 MIN",
    teaser: "Why capturing signs works better than studying an Anki deck.",
    accentColor: "#f97316",
    accentBg: "rgba(249,115,22,0.1)",
  },
];

const STORAGE_KEY_PREFIX = "insight_completed_";
const START_KEY_PREFIX = "insight_started_at_";

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

export function recordInsightStart(id: string): void {
  try {
    const key = START_KEY_PREFIX + id;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, new Date().toISOString());
    }
  } catch {
    // ignore storage errors
  }
}

export function getInsightStartTime(id: string): Date | null {
  try {
    const v = localStorage.getItem(START_KEY_PREFIX + id);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export interface LessonState {
  lesson: Lesson;
  locked: boolean;
  unlocksAt: Date | null;
}

export function getCurrentLesson(): LessonState {
  for (let i = 0; i < LESSONS.length; i++) {
    if (!isLessonCompleted(LESSONS[i].id)) {
      if (i === 0) return { lesson: LESSONS[0], locked: false, unlocksAt: null };
      const prevStart = getInsightStartTime(LESSONS[i - 1].id);
      if (!prevStart) return { lesson: LESSONS[i], locked: true, unlocksAt: null };
      const unlocksAt = new Date(prevStart.getTime() + 12 * 60 * 60 * 1000);
      const locked = Date.now() < unlocksAt.getTime();
      return { lesson: LESSONS[i], locked, unlocksAt: locked ? unlocksAt : null };
    }
  }
  // All completed — show last lesson in completed state
  return { lesson: LESSONS[LESSONS.length - 1], locked: false, unlocksAt: null };
}
