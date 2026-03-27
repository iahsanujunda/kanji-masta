import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
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

type View = "welcome" | "loading" | "deck" | "saving" | "batch-done" | "photo-prompt" | "finished";

export default function Onboarding() {
  const navigate = useNavigate();
  const [kanji, setKanji] = useState<OnboardingKanji[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [batchSelections, setBatchSelections] = useState<Selection[]>([]);
  const [view, setView] = useState<View>("welcome");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [slideIn, setSlideIn] = useState(true);

  // Cumulative counts across all saved batches
  const [totalLearning, setTotalLearning] = useState(0);
  const [totalFamiliar, setTotalFamiliar] = useState(0);

  const loadBatch = useCallback(async (newOffset: number) => {
    setView("loading");
    try {
      const data = await apiFetch<{ kanji: OnboardingKanji[]; hasMore: boolean }>(
        `/api/onboarding/kanji?offset=${newOffset}&limit=10`
      );
      setKanji(data.kanji);
      setHasMore(data.hasMore);
      setCurrentIndex(0);
      setBatchSelections([]);
      setSlideIn(true);
      setView(data.kanji.length > 0 ? "deck" : "finished");
    } catch {
      navigate("/home");
    }
  }, [navigate]);

  const startDeck = useCallback(() => {
    loadBatch(0);
  }, [loadBatch]);

  const saveBatch = useCallback(async (selections: Selection[]) => {
    if (selections.length === 0) return;
    setView("saving");
    try {
      await apiFetch("/api/onboarding/select", {
        method: "POST",
        body: JSON.stringify({ selections }),
      });
    } catch {
      // Continue anyway — selections may be partially saved
    }
    const batchLearning = selections.filter((s) => s.status === "learning").length;
    const batchFamiliar = selections.filter((s) => s.status === "familiar").length;
    setTotalLearning((prev) => prev + batchLearning);
    setTotalFamiliar((prev) => prev + batchFamiliar);
    setView("batch-done");
  }, []);

  const handleDecision = useCallback((status: "learning" | "familiar") => {
    if (animating) return;
    const current = kanji[currentIndex];
    const newSelections = [...batchSelections, { kanjiMasterId: current.kanjiMasterId, status }];
    setBatchSelections(newSelections);

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
        // Batch complete — save immediately
        saveBatch(newSelections);
      }
    }, 300);
  }, [animating, kanji, currentIndex, batchSelections, saveBatch]);

  const handleAddMore = useCallback(() => {
    const newOffset = offset + 10;
    setOffset(newOffset);
    loadBatch(newOffset);
  }, [offset, loadBatch]);

  const completeOnboarding = useCallback(async () => {
    try {
      await apiFetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      // Continue anyway
    }
  }, []);

  const allLearning = totalLearning;
  const allFamiliar = totalFamiliar;
  const allTotal = allLearning + allFamiliar;

  // --- Welcome ---
  if (view === "welcome") {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 80, height: 80, borderRadius: 3, background: "linear-gradient(135deg, #34d399, #4338ca)", display: "flex", alignItems: "center", justifyContent: "center", mb: 4 }}>
          <SpaIcon sx={{ fontSize: 40, color: "white" }} />
        </Box>
        <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
          Welcome to Shuukan
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 5, maxWidth: 320 }}>
          Let's set up your profile. Mark kanji you already know so we can personalize your learning.
        </Typography>
        <Button
          fullWidth
          variant="contained"
          onClick={startDeck}
          sx={{
            bgcolor: "#10b981", color: "black", fontWeight: 700, py: 2, borderRadius: "9999px",
            fontSize: "1.1rem", textTransform: "none", maxWidth: 320,
            boxShadow: "0 0 20px rgba(16,185,129,0.2)",
            "&:hover": { bgcolor: "#34d399" },
          }}
        >
          Get Started
        </Button>
        <Button
          onClick={async () => {
            await completeOnboarding();
            navigate("/home");
          }}
          sx={{ mt: 2, color: "grey.500", textTransform: "none", "&:hover": { color: "grey.300" } }}
        >
          Skip for now
        </Button>
      </Box>
    );
  }

  // --- Photo prompt ---
  if (view === "photo-prompt") {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 80, height: 80, bgcolor: "rgba(99,102,241,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <CameraAltIcon sx={{ fontSize: 40, color: "#818cf8" }} />
        </Box>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
          Take your first photo
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 5, maxWidth: 320 }}>
          Snap any sign, menu, or notice around you. We'll extract the kanji and create your first quizzes.
        </Typography>
        <Button
          fullWidth
          variant="contained"
          startIcon={<CameraAltIcon />}
          onClick={async () => {
            await completeOnboarding();
            navigate("/capture");
          }}
          sx={{
            bgcolor: "#10b981", color: "black", fontWeight: 700, py: 2, borderRadius: "9999px",
            fontSize: "1.1rem", textTransform: "none", maxWidth: 320,
            boxShadow: "0 0 20px rgba(16,185,129,0.2)",
            "&:hover": { bgcolor: "#34d399" },
          }}
        >
          Open Camera
        </Button>
        <Button
          onClick={async () => {
            await completeOnboarding();
            navigate("/home");
          }}
          sx={{ mt: 2, color: "grey.500", textTransform: "none", "&:hover": { color: "grey.300" } }}
        >
          Skip for now
        </Button>
      </Box>
    );
  }

  // --- Loading / Saving ---
  if (view === "loading" || view === "saving") {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">
          {view === "saving" ? "Saving your selections..." : "Loading kanji..."}
        </Typography>
      </Box>
    );
  }

  // --- Batch done — ask to continue or finish ---
  if (view === "batch-done") {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 64, height: 64, bgcolor: "rgba(67, 56, 202, 0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <CheckIcon sx={{ fontSize: 32, color: "#818cf8" }} />
        </Box>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 0.5 }}>
          {allTotal} kanji reviewed
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          {allLearning > 0 && <><strong>{allLearning}</strong> to learn</>}
          {allLearning > 0 && allFamiliar > 0 && " · "}
          {allFamiliar > 0 && <><strong>{allFamiliar}</strong> already known</>}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ mb: 4 }}>
          Progress saved automatically
        </Typography>

        {/* Action buttons */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%", maxWidth: 320 }}>
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
            onClick={() => setView("photo-prompt")}
            sx={{
              py: 1.5,
              borderRadius: 3,
              fontWeight: "bold",
              ...(hasMore
                ? { borderColor: "grey.700", color: "grey.300" }
                : { bgcolor: "#4338ca", "&:hover": { bgcolor: "#3730a3" } }),
            }}
          >
            {allLearning > 0 ? "Start learning" : "Done"}
          </Button>
        </Box>
      </Box>
    );
  }

  // --- Finished — no more kanji available ---
  if (view === "finished") {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 80, height: 80, bgcolor: "rgba(16, 185, 129, 0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <CheckIcon sx={{ fontSize: 40, color: "#34d399" }} />
        </Box>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
          You're all set!
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          {allLearning > 0
            ? `${allLearning} kanji planted. Quizzes are being prepared.`
            : "Capture a photo to start learning kanji."}
        </Typography>
        <Button
          onClick={async () => {
            await completeOnboarding();
            navigate("/home");
          }}
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
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", position: "relative" }}>
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
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 2, textTransform: "capitalize" }}>
          {current.meanings[0] || ""}
        </Typography>

        {/* Readings — ON / KUN rows */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 3 }}>
          {current.onyomi.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Typography variant="caption" sx={{ color: "grey.500", width: 28, flexShrink: 0, mt: 0.25 }}>ON</Typography>
              <Typography variant="body2" sx={{ color: "#818cf8", fontFamily: "monospace", fontWeight: 500 }}>
                {current.onyomi.join("、")}
              </Typography>
            </Box>
          )}
          {current.kunyomi.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Typography variant="caption" sx={{ color: "grey.500", width: 28, flexShrink: 0, mt: 0.25 }}>KUN</Typography>
              <Typography variant="body2" sx={{ color: "#34d399", fontFamily: "monospace", fontWeight: 500 }}>
                {current.kunyomi.join("、")}
              </Typography>
            </Box>
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
          pb: 5,
          pt: 4,
          background: (theme) => `linear-gradient(transparent, ${theme.palette.background.default} 30%)`,
        }}
      >
        <Box sx={{ display: "flex", gap: 2, maxWidth: 480 - 48, width: "100%", mx: 3 }}>
          <Button
            fullWidth
            onClick={() => handleDecision("familiar")}
            disabled={animating}
            sx={{
              py: 2,
              borderRadius: 3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
              bgcolor: "grey.900",
              color: "#34d399",
              border: "2px solid rgba(16, 185, 129, 0.3)",
              "&:hover": { bgcolor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.5)" },
              textTransform: "none",
            }}
          >
            <ParkIcon sx={{ fontSize: 22, mb: 0.25 }} />
            <Typography variant="body2" fontWeight="bold">Already Know</Typography>
            <Typography variant="caption" sx={{ color: "grey.500", fontSize: "0.6rem" }}>
              Not sure? Risk it.
            </Typography>
          </Button>
          <Button
            fullWidth
            onClick={() => handleDecision("learning")}
            disabled={animating}
            sx={{
              py: 2,
              borderRadius: 3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
              bgcolor: "#4338ca",
              color: "white",
              border: "2px solid #6366f1",
              boxShadow: "0 0 20px rgba(79,70,229,0.3)",
              "&:hover": { bgcolor: "#3730a3" },
              textTransform: "none",
            }}
          >
            <SpaIcon sx={{ fontSize: 22, mb: 0.25 }} />
            <Typography variant="body2" fontWeight="bold">Want to Learn</Typography>
            <Typography variant="caption" sx={{ color: "rgba(199,210,254,0.7)", fontSize: "0.6rem" }}>
              Start from Level 0
            </Typography>
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
