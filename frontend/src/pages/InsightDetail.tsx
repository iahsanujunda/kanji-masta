import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ReplayIcon from "@mui/icons-material/Replay";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PageHeader from "@/components/PageHeader";
import { LESSONS, isLessonCompleted, markLessonCompleted } from "@/lib/insights";

export default function InsightDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lesson = LESSONS.find((l) => l.id === id);

  const [completed, setCompleted] = useState(() => (lesson ? isLessonCompleted(lesson.id) : false));

  if (!lesson) {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
        <PageHeader title="Lesson" onBack={() => navigate(-1)} />
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography color="text.secondary">Lesson not found.</Typography>
        </Box>
      </Box>
    );
  }

  const handleComplete = () => {
    markLessonCompleted(lesson.id);
    setCompleted(true);
    navigate(-1);
  };

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <PageHeader
        title=""
        subtitle={
          <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "text.disabled" }}>
            Methodology Course
          </Typography>
        }
        onBack={() => navigate(-1)}
      />

      <Box sx={{ flex: 1, px: 3, pb: lesson.interactive ? 4 : 16, overflow: "auto" }}>
        {lesson.interactive ? (
          <InteractiveLesson1 onComplete={handleComplete} isCompleted={completed} />
        ) : (
          <StaticLesson lesson={lesson} />
        )}
      </Box>

      {/* Sticky footer only for static lessons */}
      {!lesson.interactive && (
        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pb: 4,
            pt: 6,
            background: (theme) => `linear-gradient(transparent, ${theme.palette.background.default} 40%)`,
            pointerEvents: "none",
          }}
        >
          <Button
            variant="contained"
            size="large"
            onClick={handleComplete}
            startIcon={completed ? <CheckCircleIcon /> : undefined}
            sx={{
              pointerEvents: "auto",
              maxWidth: 480 - 48,
              width: "100%",
              mx: 3,
              py: 2,
              borderRadius: 8,
              fontSize: "1rem",
              fontWeight: "bold",
              ...(completed
                ? { bgcolor: "grey.800", color: "grey.500", border: "1px solid", borderColor: "grey.700", "&:hover": { bgcolor: "grey.800" } }
                : { bgcolor: "#10b981", color: "black", "&:hover": { bgcolor: "#34d399" }, boxShadow: "0 0 30px rgba(16,185,129,0.3)" }
              ),
            }}
          >
            {completed ? "Lesson Complete" : "Mark as Complete"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Interactive Lesson 1: The Illusion of Flashcards
// =============================================================================

function InteractiveLesson1({ onComplete, isCompleted }: { onComplete: () => void; isCompleted: boolean }) {
  const [step, setStep] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);

  const handleFlip = () => {
    setIsFlipped((f) => !f);
    setHasFlippedOnce(true);
  };

  return (
    <Box sx={{ py: 3, display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Title */}
      <Box>
        <Typography variant="h4" fontWeight={900} sx={{ mb: 1.5, lineHeight: 1.2 }}>
          The Illusion of Flashcards
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
          Our brain is not built for repeating a single character and hoping it sticks.
        </Typography>
      </Box>

      {/* STEP 0: The Hook & Flashcard */}
      {step === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            We stare at a flashcard, flip it to check the translation, and memorize the meaning perfectly. Sounds familiar?
          </Typography>

          {/* Flashcard */}
          <Box
            component="button"
            onClick={handleFlip}
            sx={{
              width: "100%",
              aspectRatio: "4/3",
              bgcolor: "#0f0f16",
              border: "1px solid",
              borderColor: "grey.800",
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              cursor: "pointer",
              transition: "transform 0.1s",
              "&:active": { transform: "scale(0.98)" },
              background: "transparent",
              p: 0,
            }}
          >
            {/* Flip icon */}
            <Box sx={{ position: "absolute", top: 16, right: 16, color: hasFlippedOnce ? "text.disabled" : "#10b981" }}>
              <ReplayIcon sx={{ fontSize: 22, ...(hasFlippedOnce ? {} : { "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } }, animation: "pulse 2s ease-in-out infinite" }) }} />
            </Box>
            {/* Kanji side */}
            <Typography
              sx={{
                fontSize: "6rem",
                fontWeight: 500,
                lineHeight: 1,
                position: "absolute",
                transition: "opacity 0.25s, transform 0.25s",
                opacity: isFlipped ? 0 : 1,
                transform: isFlipped ? "scale(0.9)" : "scale(1)",
              }}
            >
              発
            </Typography>
            {/* Answer side */}
            <Typography
              sx={{
                fontSize: "2rem",
                fontWeight: 700,
                color: "#10b981",
                letterSpacing: 2,
                textTransform: "uppercase",
                position: "absolute",
                transition: "opacity 0.25s, transform 0.25s",
                opacity: isFlipped ? 1 : 0,
                transform: isFlipped ? "scale(1)" : "scale(0.9)",
              }}
            >
              Departure
            </Typography>
          </Box>

          {hasFlippedOnce && (
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={() => setStep(1)}
              sx={{ bgcolor: "#4338ca", color: "white", fontWeight: 700, py: 1.75, borderRadius: 3, "&:hover": { bgcolor: "#4f46e5" } }}
            >
              I memorized it. Next.
            </Button>
          )}
        </Box>
      )}

      {/* STEP 1: The Trap (Quiz) */}
      {step === 1 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            Three days later, we see this in a quiz. Which one was it again?
          </Typography>

          <Box sx={{ bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 4, p: 3 }}>
            <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "text.disabled", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", mb: 1 }}>
              Select Translation
            </Typography>
            <Typography variant="h5" fontWeight="bold" sx={{ textAlign: "center", mb: 3 }}>
              Departure
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {["廃", "登", "発"].map((kanji) => {
                const isCorrect = kanji === "発";
                const isPicked = quizAnswer === kanji;
                const answered = quizAnswer !== null;

                const sx = answered
                  ? isCorrect
                    ? { bgcolor: "rgba(16,185,129,0.15)", borderColor: "#10b981", color: "#34d399" }
                    : isPicked
                    ? { bgcolor: "rgba(239,68,68,0.15)", borderColor: "#ef4444", color: "#f87171" }
                    : { bgcolor: "#0a0a0f", borderColor: "grey.900", color: "grey.700", opacity: 0.5 }
                  : { bgcolor: "grey.900", borderColor: "grey.700", color: "text.primary", "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } };

                return (
                  <Box
                    key={kanji}
                    component="button"
                    disabled={answered}
                    onClick={() => setQuizAnswer(kanji)}
                    sx={{
                      width: "100%",
                      py: 2,
                      borderRadius: 3,
                      border: "2px solid",
                      fontSize: "2rem",
                      fontWeight: 500,
                      cursor: answered ? "default" : "pointer",
                      transition: "all 0.2s",
                      background: "transparent",
                      ...sx,
                    }}
                  >
                    {kanji}
                  </Box>
                );
              })}
            </Box>
          </Box>

          {quizAnswer && (
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={() => setStep(2)}
              sx={{ bgcolor: "#4338ca", color: "white", fontWeight: 700, py: 1.75, borderRadius: 3, "&:hover": { bgcolor: "#4f46e5" } }}
            >
              Why was that hard?
            </Button>
          )}
        </Box>
      )}

      {/* STEP 2: The Aha Moment */}
      {step === 2 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pb: 4 }}>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            If you hesitated, it's because staring at an isolated symbol is called{" "}
            <Box component="strong" sx={{ color: "text.primary" }}>Shallow Processing</Box>.
            {" "}Our brain didn't have any context to hold onto.
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            To create a permanent memory, the brain needs a{" "}
            <Box component="span" sx={{ color: "#10b981", fontWeight: 700 }}>Phonological Anchor</Box>
            {" "}— it needs to know how a character sounds inside a real word.
          </Typography>

          {/* Context examples */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { label: "Context 1", word: ["出", "発"], reading: "しゅっぱつ", meaning: "Departure", highlight: 1 },
              { label: "Context 2", word: ["発", "音"], reading: "はつおん", meaning: "Pronunciation", highlight: 0 },
            ].map(({ label, word, reading, meaning, highlight }) => (
              <Box
                key={label}
                sx={{
                  bgcolor: "rgba(67,56,202,0.1)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  borderRadius: 3,
                  p: 2.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="caption" sx={{ color: "#818cf8", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", display: "block", mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>
                    {word.map((char, i) => (
                      <Box key={i} component="span" sx={{ color: i === highlight ? "#818cf8" : "text.primary" }}>
                        {char}
                      </Box>
                    ))}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" sx={{ color: "text.disabled", fontWeight: 700, mb: 0.25 }}>
                    {reading}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {meaning}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            This is why Shuukan anchors every character to a real word — vocabulary we'll actually see in the wild, not buried in a textbook.
          </Typography>
          <Typography variant="h6" fontWeight="bold" sx={{ color: "text.primary" }}>
            Ready to start building some deep memories?
          </Typography>

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={onComplete}
            startIcon={isCompleted ? <CheckCircleIcon /> : undefined}
            sx={{
              py: 2,
              borderRadius: 3,
              fontWeight: 700,
              mt: 1,
              ...(isCompleted
                ? { bgcolor: "grey.800", color: "grey.500", border: "1px solid", borderColor: "grey.700", "&:hover": { bgcolor: "grey.800" } }
                : { bgcolor: "#10b981", color: "black", "&:hover": { bgcolor: "#34d399" }, boxShadow: "0 0 30px rgba(16,185,129,0.3)" }
              ),
            }}
          >
            {isCompleted ? "Lesson Complete" : "Mark as Complete"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Static lesson renderer (for non-interactive lessons)
// =============================================================================

type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "callout"; text: string }
  | { type: "comparison"; bad: { char: string; label: string }; good: { char: string; label: string } };

const STATIC_CONTENT: Record<string, ContentBlock[]> = {
  "i-plus-one-rule": [
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
  "spaced-repetition": [
    { type: "heading", text: "Ebbinghaus's Forgetting Curve" },
    { type: "paragraph", text: "In 1885, psychologist Hermann Ebbinghaus mapped how memories decay. Without reinforcement, we forget roughly 50% of new information within an hour — and 90% within a week." },
    { type: "callout", text: "Each time you successfully recall something, the forgetting curve resets — and becomes shallower. The memory grows stronger with every retrieval." },
    { type: "heading", text: "The Slot System" },
    { type: "paragraph", text: "Shuukan's slot system is built on spaced repetition research. Instead of reviewing everything every day (which exhausts you) or reviewing randomly (which is inefficient), each item surfaces exactly when your brain is about to forget it." },
    { type: "paragraph", text: "A kanji you know well surfaces less often. A new one surfaces frequently. Over time, you spend your review energy where it's needed most — not on what you already know cold." },
  ],
  "context-over-isolation": [
    { type: "heading", text: "The Context Effect" },
    { type: "paragraph", text: "Research in cognitive linguistics shows that words learned in context are recalled significantly faster and more accurately than words learned in isolation — even when the isolated word was studied more times." },
    { type: "callout", text: "Context provides retrieval cues. The more cues encoded with a memory, the more ways your brain has to find it later." },
    { type: "heading", text: "What This Means for Kanji" },
    { type: "paragraph", text: "When Shuukan shows you 火 (fire) inside the word 花火 (fireworks), your brain stores the reading はなび alongside a vivid, culturally-rich concept. That richness is what makes the memory sticky." },
    { type: "paragraph", text: "This is also why photo capture is powerful. Seeing a kanji on a real menu, sign, or package attaches it to a lived experience — the strongest context of all." },
  ],
};

function StaticLesson({
  lesson,
}: {
  lesson: { id: string; title: string; teaser: string; accentColor: string; accentBg: string };
}) {
  const blocks = STATIC_CONTENT[lesson.id] ?? [];

  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="h4" fontWeight={900} sx={{ mb: 1.5, lineHeight: 1.2 }}>
        {lesson.title}
      </Typography>
      <Typography variant="body1" sx={{ color: "text.secondary", mb: 5, lineHeight: 1.7 }}>
        {lesson.teaser}
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        {blocks.map((block, idx) => {
          if (block.type === "heading") {
            return (
              <Typography key={idx} variant="h6" fontWeight="bold" sx={{ mt: 2, color: "text.primary" }}>
                {block.text}
              </Typography>
            );
          }
          if (block.type === "paragraph") {
            return (
              <Typography key={idx} variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
                {block.text}
              </Typography>
            );
          }
          if (block.type === "callout") {
            return (
              <Box key={idx} sx={{ p: 2.5, borderRadius: 3, bgcolor: lesson.accentBg, borderLeft: `4px solid ${lesson.accentColor}`, my: 1 }}>
                <Typography variant="body1" fontWeight="medium" sx={{ color: "text.primary", lineHeight: 1.7 }}>
                  {block.text}
                </Typography>
              </Box>
            );
          }
          if (block.type === "comparison") {
            return (
              <Box key={idx} sx={{ display: "flex", gap: 2, my: 1 }}>
                <Box sx={{ flex: 1, bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 3, p: 2.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: "2.5rem", color: "grey.600" }}>{block.bad.char}</Typography>
                  <Typography variant="caption" sx={{ color: "grey.600", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                    {block.bad.label}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, bgcolor: lesson.accentBg, border: "1px solid", borderColor: `${lesson.accentColor}4D`, borderRadius: 3, p: 2.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: "2.5rem", color: lesson.accentColor }}>{block.good.char}</Typography>
                  <Typography variant="caption" sx={{ color: lesson.accentColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                    {block.good.label}
                  </Typography>
                </Box>
              </Box>
            );
          }
          return null;
        })}
      </Box>
    </Box>
  );
}
