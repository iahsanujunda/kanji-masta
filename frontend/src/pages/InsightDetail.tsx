import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import ReplayIcon from "@mui/icons-material/Replay";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { LESSONS, isLessonCompleted, markLessonCompleted, recordInsightStart } from "@/lib/insights";

export default function InsightDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lesson = LESSONS.find((l) => l.id === id);

  const [completed, setCompleted] = useState(() => (lesson ? isLessonCompleted(lesson.id) : false));
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [showBirthGate, setShowBirthGate] = useState(false);
  const [birthInput, setBirthInput] = useState("");
  const [savingBirth, setSavingBirth] = useState(false);
  const [birthError, setBirthError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    if (!lesson) return;
    recordInsightStart(lesson.id);

    // Flush pending birth date stored at signup (before auth was available)
    const pending = localStorage.getItem("pending_birth_date");
    if (pending) {
      apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ birthDate: pending }) })
        .then(() => {
          setBirthDate(pending);
          try { localStorage.removeItem("pending_birth_date"); } catch { /* ignore */ }
        })
        .catch(() => {
          // If save fails, still try to get from backend
        })
        .finally(() => setSettingsLoading(false));
      return;
    }

    apiFetch("/api/settings").then((data: any) => {
      if (data.birthDate) {
        setBirthDate(data.birthDate);
      } else {
        setShowBirthGate(true);
      }
    }).finally(() => setSettingsLoading(false));
  }, [lesson?.id]);

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

  const handleSaveBirthDate = async () => {
    if (!birthInput) { setBirthError("Please enter your date of birth."); return; }
    if (new Date(birthInput) >= new Date()) { setBirthError("Date of birth must be in the past."); return; }
    setSavingBirth(true);
    setBirthError("");
    try {
      await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ birthDate: birthInput }) });
      setBirthDate(birthInput);
      setShowBirthGate(false);
    } catch {
      setBirthError("Failed to save. Please try again.");
    } finally {
      setSavingBirth(false);
    }
  };

  const showGate = showBirthGate && !birthDate;

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
        {settingsLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
            <CircularProgress size={28} sx={{ color: "text.disabled" }} />
          </Box>
        ) : showGate ? (
          <BirthDateGate
            birthInput={birthInput}
            onBirthInputChange={setBirthInput}
            onSave={handleSaveBirthDate}
            saving={savingBirth}
            error={birthError}
          />
        ) : lesson.id === "illusion-of-flashcards" ? (
          <InteractiveLesson1 onComplete={handleComplete} isCompleted={completed} />
        ) : lesson.id === "wild-is-your-classroom" ? (
          <InteractiveLesson2 onComplete={handleComplete} isCompleted={completed} birthDate={birthDate} />
        ) : null}
      </Box>
    </Box>
  );
}

// =============================================================================
// Birth Date Gate
// =============================================================================

function BirthDateGate({
  birthInput, onBirthInputChange, onSave, saving, error,
}: {
  birthInput: string;
  onBirthInputChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <Box sx={{ py: 3, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h5" fontWeight={900} sx={{ mb: 1.5 }}>
          One quick thing
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
          We use your birth month to personalize your lessons.
        </Typography>
      </Box>

      <TextField
        label="Date of Birth"
        type="date"
        fullWidth
        value={birthInput}
        onChange={(e) => onBirthInputChange(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        error={!!error}
        helperText={error}
      />

      <Button
        fullWidth variant="contained" size="large"
        onClick={onSave}
        disabled={saving || !birthInput}
        sx={{ bgcolor: "#10b981", color: "black", fontWeight: 700, py: 1.75, borderRadius: 3, "&:hover": { bgcolor: "#34d399" }, "&.Mui-disabled": { bgcolor: "grey.800", color: "grey.600" } }}
      >
        {saving ? "Saving..." : "Continue"}
      </Button>
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

// =============================================================================
// Lesson 2: The Wild is Your Classroom
// =============================================================================

const N5_KANJI = ["一","二","三","四","五","六","七","八","九","十","日","月","木","水","火","金","土","中","野","年"];
const MONTH_KANJI = ["一","二","三","四","五","六","七","八","九","十","十一","十二"];

function getBirthMonthKanji(birthDate: string | null): string {
  if (!birthDate) return "十二";
  const month = new Date(birthDate + "T12:00:00").getMonth(); // 0-indexed, noon to avoid TZ offset
  return MONTH_KANJI[month];
}

function InteractiveLesson2({ onComplete, isCompleted, birthDate }: { onComplete: () => void; isCompleted: boolean; birthDate: string | null }) {
  const [step, setStep] = useState(0);
  const [revealedCards, setRevealedCards] = useState([false, false]);

  const handleReveal = (idx: number) => {
    const next = [...revealedCards];
    next[idx] = true;
    setRevealedCards(next);
    if (next.every(Boolean) && step === 2) {
      setTimeout(() => setStep(3), 600);
    }
  };

  const monthKanji = getBirthMonthKanji(birthDate);

  return (
    <Box sx={{ py: 3, display: "flex", flexDirection: "column", gap: 4 }}>
      <Box>
        <Typography variant="h4" fontWeight={900} sx={{ mb: 1.5, lineHeight: 1.2 }}>
          The Wild is Your Classroom
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
          Why capturing signs works better than studying an Anki deck.
        </Typography>
      </Box>

      {/* STEP 0: The boring textbook grid */}
      {step === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            Ever wonder why every textbook tells us to start learning kanji with lists like these?
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            Me neither. But neuroscientists call this <Box component="strong" sx={{ color: "text.primary" }}>Intentional Learning</Box>. It requires massive willpower and yields very low retention.
          </Typography>

          <Box
            component="button"
            onClick={() => setStep(1)}
            sx={{
              width: "100%", bgcolor: "#0a0a0f", border: "1px solid", borderColor: "grey.800",
              borderRadius: 4, p: 3, cursor: "pointer", position: "relative",
              "&:hover .kanji-grid": { opacity: 0.3 },
              "&:hover .escape-hint": { opacity: 1, transform: "translateY(0)" },
              "&:active": { transform: "scale(0.98)" },
              transition: "transform 0.1s",
              background: "transparent",
            }}
          >
            <Box className="kanji-grid" sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1.5, opacity: 0.6, transition: "opacity 0.3s" }}>
              {N5_KANJI.map((k, i) => (
                <Box key={i} sx={{ aspectRatio: "1", bgcolor: "#1a1a24", border: "1px solid", borderColor: "grey.800", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", color: "grey.500" }}>
                  {k}
                </Box>
              ))}
            </Box>
            <Box
              className="escape-hint"
              sx={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.2)", borderRadius: 4,
                opacity: 0, transition: "opacity 0.3s, transform 0.3s", transform: "translateY(8px)",
              }}
            >
              <Box sx={{ bgcolor: "white", color: "black", fontWeight: 700, px: 2.5, py: 1.25, borderRadius: 99, display: "flex", alignItems: "center", gap: 1, boxShadow: "0 0 30px rgba(255,255,255,0.3)" }}>
                Tap to escape <ChevronRightIcon sx={{ fontSize: 18 }} />
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* STEP 1: Incidental Learning */}
      {step === 1 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            But encountering a word organically while trying to read a menu or navigate a train station is called{" "}
            <Box component="span" sx={{ color: "#f97316", fontWeight: 700 }}>Incidental Learning</Box>.
          </Typography>

          <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: "rgba(249,115,22,0.1)", borderLeft: "4px solid #f97316" }}>
            <Typography variant="body1" sx={{ color: "#fed7aa", lineHeight: 1.7 }}>
              Research shows that Incidental Learning creates much stronger, longer-lasting memories because the brain ties the vocabulary to a physical, emotional event.
            </Typography>
          </Box>

          <Button
            fullWidth variant="contained" size="large"
            onClick={() => setStep(2)}
            sx={{ bgcolor: "#f97316", color: "white", fontWeight: 700, py: 1.75, borderRadius: 3, "&:hover": { bgcolor: "#fb923c" } }}
          >
            See How
          </Button>
        </Box>
      )}

      {/* STEP 2: Real-world reveals */}
      {step >= 2 && step < 3 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            Tap below to see where those "boring" textbook words actually live in the real world.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Card 1: Nakano station */}
            {!revealedCards[0] ? (
              <Button
                fullWidth variant="outlined"
                onClick={() => handleReveal(0)}
                endIcon={<CameraAltIcon />}
                sx={{ py: 1.75, borderRadius: 3, borderColor: "grey.700", color: "text.secondary", justifyContent: "space-between", fontWeight: 700, "&:hover": { borderColor: "grey.500", bgcolor: "rgba(255,255,255,0.04)" } }}
              >
                Nakano (Station)
              </Button>
            ) : (
              <Box
                component="img"
                src="/nakano-station.png"
                alt="Nakano Station Sign"
                sx={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 3, border: "1px solid", borderColor: "grey.800", animation: "zoomIn 0.3s ease-out", "@keyframes zoomIn": { from: { opacity: 0, transform: "scale(0.95)" }, to: { opacity: 1, transform: "scale(1)" } } }}
              />
            )}

            {/* Card 2: Birth month */}
            {!revealedCards[1] ? (
              <Button
                fullWidth variant="outlined"
                onClick={() => handleReveal(1)}
                endIcon={<CameraAltIcon />}
                sx={{ py: 1.75, borderRadius: 3, borderColor: "grey.700", color: "text.secondary", justifyContent: "space-between", fontWeight: 700, "&:hover": { borderColor: "grey.500", bgcolor: "rgba(255,255,255,0.04)" } }}
              >
                Your Birth Month
              </Button>
            ) : (
              <Box
                sx={{ bgcolor: "#0f0f16", borderRadius: 3, border: "1px solid", borderColor: "grey.800", height: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "zoomIn 0.3s ease-out", "@keyframes zoomIn": { from: { opacity: 0, transform: "scale(0.95)" }, to: { opacity: 1, transform: "scale(1)" } } }}
              >
                <Typography sx={{ fontSize: "3rem", fontWeight: 900, color: "#ef4444", letterSpacing: 2 }}>
                  {monthKanji}月
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled", mt: 1 }}>
                  Your birth month
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* STEP 3: Payoff */}
      {step === 3 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2, borderTop: "1px solid", borderColor: "grey.900" }}>
          <Typography variant="h6" fontWeight={900} sx={{ color: "text.primary", lineHeight: 1.5 }}>
            That's why Shuukan gives you a way to learn without textbooks. We want you to collect souvenirs from your daily life.
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
            Let our algorithm handle the memorization for you.
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
            {isCompleted ? "Lesson Completed" : "Mark as Complete"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
