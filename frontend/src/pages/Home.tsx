import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import SettingsIcon from "@mui/icons-material/Settings";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import TranslateIcon from "@mui/icons-material/Translate";
import SpaIcon from "@mui/icons-material/Spa";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

function formatTimeLeft(endDate: Date): string {
  const diffMs = endDate.getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

interface UserSummary {
  kanjiLearning: number;
  kanjiFamiliar: number;
  wordCount: number;
  streak: number;
  slotRemaining: number;
  slotTotal: number;
  slotEndsAt: string | null;
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [quizBanner, setQuizBanner] = useState(false);

  const { data: summary, isLoading: loading } = useQuery({
    queryKey: ["user-summary"],
    queryFn: () => apiFetch<UserSummary>("/api/user/summary"),
    staleTime: 30_000, // consider fresh for 30s
  });

  // Handle navigation state from Capture page
  useEffect(() => {
    const state = location.state as { error?: string; quizGenerating?: boolean } | null;
    window.history.replaceState({}, "");

    if (state?.error) {
      setErrorBanner(state.error);
      const timer = setTimeout(() => setErrorBanner(null), 5000);
      return () => clearTimeout(timer);
    }

    if (state?.quizGenerating) {
      setQuizBanner(true);
      const timer = setTimeout(() => setQuizBanner(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const streak = summary?.streak ?? 0;
  const kanjiLearning = summary?.kanjiLearning ?? 0;
  const kanjiFamiliar = summary?.kanjiFamiliar ?? 0;
  const wordCount = summary?.wordCount ?? 0;
  const slotRemaining = summary?.slotRemaining ?? 0;
  const slotTotal = summary?.slotTotal ?? 5;
  const slotEndsAt = summary?.slotEndsAt;
  const slotEndDate = slotEndsAt ? new Date(slotEndsAt) : null;
  const hasActiveSlot = slotEndDate != null && slotEndDate > new Date();
  const slotTimeLeft = slotEndDate ? formatTimeLeft(slotEndDate) : "";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <PageHeader
        title="Kanji Masta"
        subtitle="Yokohama, JP"
        right={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Chip
              icon={<WhatshotIcon sx={{ fontSize: 18 }} />}
              label={loading ? "–" : streak}
              size="small"
              sx={{
                bgcolor: "rgba(255, 152, 0, 0.15)",
                color: "warning.main",
                fontWeight: "bold",
              }}
            />
            <IconButton
              color="inherit"
              onClick={() => navigate("/settings")}
              sx={{ color: "text.secondary" }}
            >
              <SettingsIcon />
            </IconButton>
          </Box>
        }
      />

      {/* Main content */}
      <Box sx={{ flex: 1, px: 3, pb: 16, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Error banner */}
        {errorBanner && (
          <Box
            sx={{
              borderRadius: 3, p: 2, display: "flex", alignItems: "center", gap: 1.5,
              bgcolor: "rgba(211, 47, 47, 0.12)", border: "1px solid", borderColor: "rgba(211, 47, 47, 0.3)",
            }}
          >
            <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "rgba(211, 47, 47, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ErrorOutlineIcon sx={{ fontSize: 18, color: "error.main" }} />
            </Box>
            <Typography variant="body2" sx={{ color: "error.light" }}>{errorBanner}</Typography>
          </Box>
        )}

        {/* Quiz generation banner */}
        {quizBanner && (
          <Box
            sx={{
              borderRadius: 3, p: 2, display: "flex", alignItems: "center", gap: 1.5,
              bgcolor: "rgba(67, 56, 202, 0.12)", border: "1px solid", borderColor: "rgba(67, 56, 202, 0.3)",
            }}
          >
            <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "rgba(67, 56, 202, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CheckCircleIcon sx={{ fontSize: 18, color: "#818cf8" }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ color: "#c7d2fe" }}>Kanji saved</Typography>
              <Typography variant="caption" sx={{ color: "#a5b4fc" }}>Quizzes are being prepared in the background</Typography>
            </Box>
          </Box>
        )}

        {/* Quiz slot card */}
        {loading ? (
          <Skeleton variant="rounded" height={160} sx={{ borderRadius: 4 }} />
        ) : wordCount === 0 ? (
          /* No kanji yet — onboarding prompt */
          <Paper elevation={4} sx={{ bgcolor: "#4338ca", color: "white", borderRadius: 4, p: 3, textAlign: "center" }}>
            <SpaIcon sx={{ fontSize: 40, opacity: 0.7, mb: 1.5 }} />
            <Typography fontWeight="bold" sx={{ mb: 0.5 }}>Plant Your First Seeds</Typography>
            <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
              Choose kanji you already know and ones you want to learn
            </Typography>
            <Button
              fullWidth
              variant="contained"
              onClick={() => navigate("/onboarding")}
              sx={{ bgcolor: "white", color: "#4338ca", fontWeight: "bold", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "grey.100" } }}
            >
              Start Learning
            </Button>
          </Paper>
        ) : hasActiveSlot && slotRemaining > 0 ? (
          /* Active slot with quizzes remaining */
          <Paper elevation={4} sx={{ bgcolor: "#4338ca", color: "white", borderRadius: 4, p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8, mb: 0.5 }}>Session Active</Typography>
                <Typography variant="h3" fontWeight="bold" component="div">
                  {slotRemaining}{" "}
                  <Typography component="span" variant="h6" sx={{ opacity: 0.7, fontWeight: "normal" }}>remaining</Typography>
                </Typography>
              </Box>
              <Chip label={slotTimeLeft} size="small" sx={{ bgcolor: "rgba(30, 27, 75, 0.5)", color: "inherit", fontSize: "0.75rem" }} />
            </Box>
            <Button
              fullWidth size="large" variant="contained" endIcon={<ChevronRightIcon />}
              onClick={() => navigate("/quiz")}
              sx={{ bgcolor: "white", color: "#4338ca", fontWeight: "bold", fontSize: "1.1rem", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "grey.100" } }}
            >
              Continue Session
            </Button>
          </Paper>
        ) : hasActiveSlot && slotRemaining === 0 ? (
          /* Slot complete */
          <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "success.dark", bgcolor: "rgba(46, 125, 50, 0.08)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
              <CheckCircleIcon color="success" />
              <Typography fontWeight="bold" color="success.main">Session Complete</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Great job! Your next session starts whenever you're ready.
            </Typography>
          </Paper>
        ) : (
          /* No active slot — ready to start */
          <Paper elevation={4} sx={{ bgcolor: "#4338ca", color: "white", borderRadius: 4, p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8, mb: 0.5 }}>Ready to quiz</Typography>
                <Typography variant="h3" fontWeight="bold" component="div">
                  {slotTotal}{" "}
                  <Typography component="span" variant="h6" sx={{ opacity: 0.7, fontWeight: "normal" }}>quizzes</Typography>
                </Typography>
              </Box>
            </Box>
            <Button
              fullWidth size="large" variant="contained" endIcon={<ChevronRightIcon />}
              onClick={() => navigate("/quiz")}
              sx={{ bgcolor: "white", color: "#4338ca", fontWeight: "bold", fontSize: "1.1rem", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "grey.100" } }}
            >
              Start Session
            </Button>
          </Paper>
        )}

        {/* Kanji stats card */}
        <Paper
          variant="outlined"
          onClick={() => navigate("/collection")}
          sx={{ borderRadius: 4, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ bgcolor: "action.selected", p: 1.5, borderRadius: 3, display: "flex" }}>
              <MenuBookIcon />
            </Box>
            <Box>
              <Typography fontWeight="bold">Your Kanji</Typography>
              <Box sx={{ display: "flex", gap: 1.5, mt: 0.25 }}>
                <Typography variant="body2" color="primary.main" fontWeight="medium">
                  {loading ? "–" : kanjiLearning} learning
                </Typography>
                <Typography variant="body2" color="text.disabled">•</Typography>
                <Typography variant="body2" color="text.secondary">
                  {loading ? "–" : kanjiFamiliar} familiar
                </Typography>
              </Box>
            </Box>
          </Box>
          <ChevronRightIcon sx={{ color: "text.disabled" }} />
        </Paper>

        {/* Dictionary card */}
        <Paper
          variant="outlined"
          onClick={() => navigate("/dictionary")}
          sx={{ borderRadius: 4, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ bgcolor: "action.selected", p: 1.5, borderRadius: 3, display: "flex" }}>
              <TranslateIcon />
            </Box>
            <Box>
              <Typography fontWeight="bold">Dictionary</Typography>
              <Typography variant="body2" color="text.secondary">
                {loading ? "–" : wordCount} words learned
              </Typography>
            </Box>
          </Box>
          <ChevronRightIcon sx={{ color: "text.disabled" }} />
        </Paper>
      </Box>

      {/* Bottom capture button */}
      <Box
        sx={{
          position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center",
          pb: 4, pt: 6, background: (theme) => `linear-gradient(transparent, ${theme.palette.background.default} 40%)`, pointerEvents: "none",
        }}
      >
        <Button
          variant="contained" size="large" onClick={() => navigate("/capture")}
          startIcon={
            <Box sx={{ bgcolor: "rgba(0,0,0,0.1)", p: 1, borderRadius: "50%", display: "flex" }}>
              <CameraAltIcon sx={{ fontSize: 28 }} />
            </Box>
          }
          sx={{
            pointerEvents: "auto", maxWidth: 480 - 48, width: "100%", mx: 3, py: 2, borderRadius: 8,
            fontSize: "1.2rem", fontWeight: "bold", letterSpacing: 1, bgcolor: "grey.100", color: "grey.900", "&:hover": { bgcolor: "grey.300" },
          }}
        >
          Capture Kanji
        </Button>
      </Box>
    </Box>
  );
}
