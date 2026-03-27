export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "callout"; text: string }
  | { type: "comparison"; bad: { char: string; label: string }; good: { char: string; label: string } };

export interface Lesson {
  id: string;
  title: string;
  readTime: string;
  teaser: string;
  accentColor: string;
  accentBg: string;
  content: ContentBlock[];
}

export const LESSONS: Lesson[] = [
  {
    id: "illusion-of-flashcards",
    title: "The Illusion of Flashcards",
    readTime: "2 MIN",
    teaser: "Why staring at single characters fails, and how our brains actually build permanent memory.",
    accentColor: "#10b981",
    accentBg: "rgba(16,185,129,0.1)",
    content: [
      { type: "heading", text: "Shallow vs. Deep Processing" },
      { type: "paragraph", text: "We've all been there — memorizing a kanji perfectly, only to completely forget it three days later. We aren't crazy. Cognitive science calls this the 'Illusion of Competence'." },
      { type: "paragraph", text: "When we stare at a flashcard of a single symbol, our brains use what researchers call Shallow Processing. It relies purely on rote visual memory, which degrades incredibly fast." },
      { type: "callout", text: "To create a permanent memory, our brains need a Phonological Anchor — a sound and context to attach the shape to." },
      { type: "heading", text: "Why Words Win" },
      { type: "paragraph", text: "This is why Shuukan rarely asks you to memorize single characters. Instead, it teaches full words." },
      { type: "comparison", bad: { char: "電", label: "Electricity (Shallow)" }, good: { char: "電車", label: "Train (Deep)" } },
      { type: "paragraph", text: "Learning 電車 (train) requires Deep Processing. Your brain links 'electricity' to 'vehicle', attaches the sound でんしゃ, and anchors it to a real-world concept. When a memory has multiple connecting nodes, it becomes nearly impossible to forget." },
    ],
  },
  {
    id: "i-plus-one-rule",
    title: "The i+1 Rule",
    readTime: "3 MIN",
    teaser: "How Shuukan uses the kanji you already know to teach you the ones you don't.",
    accentColor: "#818cf8",
    accentBg: "rgba(129,140,248,0.1)",
    content: [
      { type: "heading", text: "Comprehensible Input" },
      { type: "paragraph", text: "Linguist Stephen Krashen discovered that humans acquire language best when exposed to input exactly one step beyond their current level — not too easy, not too hard. He called this the i+1 rule." },
      { type: "callout", text: "i = your current knowledge. i+1 = content you can almost understand with one new element." },
      { type: "heading", text: "How Your Quiz Words Are Chosen" },
      { type: "paragraph", text: "When Shuukan selects example words for your quizzes, it deliberately picks words where you already recognize most of the kanji. This keeps the new information grounded in something familiar." },
      { type: "comparison", bad: { char: "醤油", label: "Two unknowns" }, good: { char: "電気", label: "Known + new" } },
      { type: "paragraph", text: "A word with two kanji you've never seen is just noise. But a word where you know one kanji is a perfect learning opportunity — your existing memory becomes the scaffold for the new one." },
      { type: "heading", text: "Why This Matters for Retention" },
      { type: "paragraph", text: "Studies show that vocabulary acquired through comprehensible input is retained 3–4× longer than vocabulary learned through isolated memorization. Every quiz session is designed around this principle." },
    ],
  },
  {
    id: "spaced-repetition",
    title: "Why You Forget — and How to Stop It",
    readTime: "2 MIN",
    teaser: "The science of the forgetting curve, and why reviewing at exactly the right moment matters.",
    accentColor: "#a78bfa",
    accentBg: "rgba(167,139,250,0.1)",
    content: [
      { type: "heading", text: "Ebbinghaus's Forgetting Curve" },
      { type: "paragraph", text: "In 1885, psychologist Hermann Ebbinghaus mapped how memories decay. Without reinforcement, we forget roughly 50% of new information within an hour — and 90% within a week." },
      { type: "callout", text: "Each time you successfully recall something, the forgetting curve resets — and becomes shallower. The memory grows stronger with every retrieval." },
      { type: "heading", text: "The Slot System" },
      { type: "paragraph", text: "Shuukan's slot system is built on spaced repetition research. Instead of reviewing everything every day (which exhausts you) or reviewing randomly (which is inefficient), each item surfaces exactly when your brain is about to forget it." },
      { type: "paragraph", text: "A kanji you know well surfaces less often. A new one surfaces frequently. Over time, you spend your review energy where it's needed most — not on what you already know cold." },
    ],
  },
  {
    id: "context-over-isolation",
    title: "Context Is Everything",
    readTime: "2 MIN",
    teaser: "Why the sentence around a word matters as much as the word itself.",
    accentColor: "#34d399",
    accentBg: "rgba(52,211,153,0.08)",
    content: [
      { type: "heading", text: "The Context Effect" },
      { type: "paragraph", text: "Research in cognitive linguistics shows that words learned in context are recalled significantly faster and more accurately than words learned in isolation — even when the isolated word was studied more times." },
      { type: "callout", text: "Context provides retrieval cues. The more cues encoded with a memory, the more ways your brain has to find it later." },
      { type: "heading", text: "What This Means for Kanji" },
      { type: "paragraph", text: "When Shuukan shows you 火 (fire) inside the word 花火 (fireworks), your brain stores the reading かわい alongside a vivid, culturally-rich concept. That richness is what makes the memory sticky." },
      { type: "paragraph", text: "This is also why photo capture is powerful. Seeing a kanji on a real menu, sign, or package attaches it to a lived experience — the strongest context of all." },
    ],
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
