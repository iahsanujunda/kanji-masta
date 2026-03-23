import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ParkIcon from "@mui/icons-material/Park";
import SpaIcon from "@mui/icons-material/Spa";
import { apiFetch } from "@/lib/api";

interface SeenAs {
  word: string;
  reading: string;
  meaning: string;
}

interface OnboardingKanji {
  kanjiMasterId: string;
  character: string;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  jlpt: number | null;
  frequency: number | null;
  seenAs: SeenAs | null;
}

interface Selection {
  kanjiMasterId: string;
  status: "learning" | "familiar";
}

type View = "loading" | "deck" | "batch-done" | "finished";

export default function Onboarding() {
  const navigate = useNavigate();
  const [kanji, setKanji] = useState<OnboardingKanji[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [view, setView] = useState<View>("loading");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [slideIn, setSlideIn] = useState(true);

  const loadBatch = useCallback(async (newOffset: number) => {
    setView("loading");
    try {
      const data = await apiFetch<{ kanji: OnboardingKanji[]; hasMore: boolean }>(
        `/api/onboarding/kanji?offset=${newOffset}&limit=10`
      );
      setKanji(data.kanji);
      setHasMore(data.hasMore);
      setCurrentIndex(0);
      setSlideIn(true);
      setView(data.kanji.length > 0 ? "deck" : "finished");
    } catch {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => { loadBatch(0); }, [loadBatch]);

  const handleDecision = useCallback((status: "learning" | "familiar") => {
    if (animating) return;
    const current = kanji[currentIndex];
    setSelections((prev) => [...prev, { kanjiMasterId: current.kanjiMasterId, status }]);

    // Animate out
    setAnimating(true);
    setSlideIn(false);

    setTimeout(() => {
      if (currentIndex < kanji.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setSlideIn(true);
        setAnimating(false);
      } else {
        setAnimating(false);
        setView("batch-done");
      }
    }, 300);
  }, [animating, kanji, currentIndex]);

  const handleAddMore = useCallback(() => {
    const newOffset = offset + 10;
    setOffset(newOffset);
    loadBatch(newOffset);
  }, [offset, loadBatch]);

  const handleFinish = useCallback(async () => {
    setView("loading");
    try {
      await apiFetch("/api/onboarding/select", {
        method: "POST",
        body: JSON.stringify({ selections }),
      });
    } catch {
      // Continue anyway
    }
    setView("finished");
  }, [selections]);

  const learningCount = selections.filter((s) => s.status === "learning").length;
  const familiarCount = selections.filter((s) => s.status === "familiar").length;

  // --- Loading ---
  if (view === "loading") {
    return (
      <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">Loading kanji...</Typography>
      </Box>
    );
  }

  // --- Batch done — ask to continue or finish ---
  if (view === "batch-done") {
    return (
      <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 64, height: 64, bgcolor: "rgba(67, 56, 202, 0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <SpaIcon sx={{ fontSize: 32, color: "#818cf8" }} />
        </Box>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
          {learningCount + familiarCount} kanji reviewed
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          {learningCount > 0 && <><strong>{learningCount}</strong> to learn</>}
          {learningCount > 0 && familiarCount > 0 && " · "}
          {familiarCount > 0 && <><strong>{familiarCount}</strong> already known</>}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%", maxWidth: 300, mt: 3 }}>
          {hasMore && (
            <Button
              fullWidth
              variant="contained"
              onClick={handleAddMore}
              sx={{ bgcolor: "#4338ca", py: 1.5, borderRadius: 3, fontWeight: "bold", "&:hover": { bgcolor: "#3730a3" } }}
            >
              Add another 10
            </Button>
          )}
          <Button
            fullWidth
            variant={hasMore ? "outlined" : "contained"}
            onClick={handleFinish}
            sx={{
              py: 1.5,
              borderRadius: 3,
              fontWeight: "bold",
              ...(hasMore
                ? { borderColor: "grey.700", color: "grey.300" }
                : { bgcolor: "#4338ca", "&:hover": { bgcolor: "#3730a3" } }),
            }}
          >
            Start learning
          </Button>
        </Box>
      </Box>
    );
  }

  // --- Finished — summary then redirect ---
  if (view === "finished") {
    return (
      <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 80, height: 80, bgcolor: "rgba(16, 185, 129, 0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <CheckIcon sx={{ fontSize: 40, color: "#34d399" }} />
        </Box>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
          You're all set!
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          {learningCount > 0
            ? `${learningCount} kanji planted. Quizzes are being prepared.`
            : "Capture a photo to start learning kanji."}
        </Typography>
        <Button
          onClick={() => navigate("/")}
          sx={{ bgcolor: "grey.800", color: "white", fontWeight: "bold", py: 1.5, px: 4, borderRadius: 3, "&:hover": { bgcolor: "grey.700" } }}
        >
          Go to Home
        </Button>
      </Box>
    );
  }

  // --- Deck view ---
  const current = kanji[currentIndex];
  const progress = ((currentIndex) / kanji.length) * 100;

  return (
    <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Progress */}
      <Box sx={{ px: 3, pt: 5, pb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {currentIndex + 1} of {kanji.length}
          </Typography>
          {current.jlpt && (
            <Typography variant="caption" sx={{ color: "#818cf8", fontWeight: 700 }}>
              JLPT N{current.jlpt}
            </Typography>
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 6, borderRadius: 3, bgcolor: "grey.800", "& .MuiLinearProgress-bar": { bgcolor: "#4338ca", borderRadius: 3 } }}
        />
      </Box>

      {/* Card */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          px: 3,
          pb: 20,
          opacity: slideIn ? 1 : 0,
          transform: slideIn ? "translateX(0)" : "translateX(-100px)",
          transition: "all 0.3s ease-out",
        }}
      >
        {/* Character */}
        <Paper
          sx={{
            width: 120,
            height: 120,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "grey.900",
            border: "1px solid",
            borderColor: "grey.800",
            mb: 3,
          }}
        >
          <Typography sx={{ fontSize: "4.5rem", fontWeight: 500 }}>{current.character}</Typography>
        </Paper>

        {/* Meaning */}
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1, textTransform: "capitalize" }}>
          {current.meanings[0] || ""}
        </Typography>

        {/* Readings */}
        <Box sx={{ display: "flex", gap: 1.5, mb: 3 }}>
          {current.onyomi.length > 0 && (
            <Typography variant="body2" sx={{ color: "#818cf8", fontFamily: "monospace" }}>
              {current.onyomi.join("、")}
            </Typography>
          )}
          {current.onyomi.length > 0 && current.kunyomi.length > 0 && (
            <Typography variant="body2" color="text.disabled">|</Typography>
          )}
          {current.kunyomi.length > 0 && (
            <Typography variant="body2" sx={{ color: "#34d399", fontFamily: "monospace" }}>
              {current.kunyomi.join("、")}
            </Typography>
          )}
        </Box>

        {/* Seen As */}
        {current.seenAs && (
          <Paper
            variant="outlined"
            sx={{ borderRadius: 3, p: 2, width: "100%", maxWidth: 300, borderColor: "grey.800" }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 1, display: "block", mb: 1 }}>
              Seen as
            </Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Typography fontWeight="bold" sx={{ fontSize: "1.1rem" }}>{current.seenAs.word}</Typography>
              <Typography variant="body2" color="text.secondary">{current.seenAs.reading}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">{current.seenAs.meaning}</Typography>
          </Paper>
        )}
      </Box>

      {/* Decision buttons */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pb: 4,
          pt: 3,
          background: (theme) => `linear-gradient(transparent, ${theme.palette.background.default} 30%)`,
        }}
      >
        <Box sx={{ display: "flex", gap: 2, maxWidth: 480 - 48, width: "100%", mx: 3 }}>
          <Button
            fullWidth
            onClick={() => handleDecision("familiar")}
            disabled={animating}
            startIcon={<ParkIcon />}
            sx={{
              py: 2,
              borderRadius: 3,
              fontWeight: "bold",
              fontSize: "0.9rem",
              bgcolor: "rgba(16, 185, 129, 0.12)",
              color: "#34d399",
              border: "2px solid rgba(16, 185, 129, 0.3)",
              "&:hover": { bgcolor: "rgba(16, 185, 129, 0.2)" },
            }}
          >
            Already Know
          </Button>
          <Button
            fullWidth
            onClick={() => handleDecision("learning")}
            disabled={animating}
            startIcon={<SpaIcon />}
            sx={{
              py: 2,
              borderRadius: 3,
              fontWeight: "bold",
              fontSize: "0.9rem",
              bgcolor: "#4338ca",
              color: "white",
              border: "2px solid #6366f1",
              "&:hover": { bgcolor: "#3730a3" },
            }}
          >
            Want to Learn
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
