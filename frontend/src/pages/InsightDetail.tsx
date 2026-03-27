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
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", position: "relative" }}>
      <PageHeader
        title=""
        subtitle={
          <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "text.disabled" }}>
            Methodology Course
          </Typography>
        }
        onBack={() => navigate(-1)}
      />

      <Box sx={{ flex: 1, px: 3, pb: 4, overflow: "auto" }}>
        <InteractiveLesson1 onComplete={handleComplete} isCompleted={completed} />
      </Box>
    </Box>
  );
}

// =============================================================================
// Lesson 1: The Illusion of Flashcards
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
            <Box sx={{ position: "absolute", top: 16, right: 16, color: hasFlippedOnce ? "text.disabled" : "#10b981" }}>
              <ReplayIcon sx={{ fontSize: 22, ...(hasFlippedOnce ? {} : { "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } }, animation: "pulse 2s ease-in-out infinite" }) }} />
            </Box>
            <Typography
              sx={{
                fontSize: "6rem", fontWeight: 500, lineHeight: 1, position: "absolute",
                transition: "opacity 0.25s, transform 0.25s",
                opacity: isFlipped ? 0 : 1,
                transform: isFlipped ? "scale(0.9)" : "scale(1)",
              }}
            >
              発
            </Typography>
            <Typography
              sx={{
                fontSize: "2rem", fontWeight: 700, color: "#10b981", letterSpacing: 2,
                textTransform: "uppercase", position: "absolute",
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
              fullWidth variant="contained" size="large"
              onClick={() => setStep(1)}
              sx={{ bgcolor: "#4338ca", color: "white", fontWeight: 700, py: 1.75, borderRadius: 3, "&:hover": { bgcolor: "#4f46e5" } }}
            >
              I memorized it. Next.
            </Button>
          )}
        </Box>
      )}

      {/* STEP 1: The Trap */}
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
                      width: "100%", py: 2, borderRadius: 3, border: "2px solid",
                      fontSize: "2rem", fontWeight: 500,
                      cursor: answered ? "default" : "pointer",
                      transition: "all 0.2s", background: "transparent",
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
              fullWidth variant="contained" size="large"
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

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { label: "Context 1", word: ["出", "発"], reading: "しゅっぱつ", meaning: "Departure", highlight: 1 },
              { label: "Context 2", word: ["発", "音"], reading: "はつおん", meaning: "Pronunciation", highlight: 0 },
            ].map(({ label, word, reading, meaning, highlight }) => (
              <Box
                key={label}
                sx={{ bgcolor: "rgba(67,56,202,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 3, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <Box>
                  <Typography variant="caption" sx={{ color: "#818cf8", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", display: "block", mb: 0.5 }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>
                    {word.map((char, i) => (
                      <Box key={i} component="span" sx={{ color: i === highlight ? "#818cf8" : "text.primary" }}>{char}</Box>
                    ))}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" sx={{ color: "text.disabled", fontWeight: 700, mb: 0.25 }}>{reading}</Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>{meaning}</Typography>
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
            fullWidth variant="contained" size="large"
            onClick={onComplete}
            startIcon={isCompleted ? <CheckCircleIcon /> : undefined}
            sx={{
              py: 2, borderRadius: 3, fontWeight: 700, mt: 1,
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
