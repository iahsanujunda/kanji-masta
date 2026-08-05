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
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import SpaIcon from "@mui/icons-material/Spa";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { formatTimeLeft, timeAgo } from "@/lib/format";
import { getCurrentLesson, isLessonCompleted } from "@/lib/insights";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ActiveScanCard, { type ActiveScanSource } from "@/components/scan/ActiveScanCard";
import { useAuth } from "@/hooks/useAuth";
import { useLocalCaptures } from "@/hooks/useCaptureQueue";
import type { RecentScanItem } from "@/lib/photo";

interface UserSummary {
  kanjiLearning: number;
  kanjiFamiliar: number;
  wordCount: number;
  streak: number;
  slotRemaining: number;
  slotTotal: number;
  slotEndsAt: string | null;
  sessionState?: "READY" | "ACTIVE" | "COOLDOWN";
  onboardingComplete: boolean;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: localCaptures } = useLocalCaptures(user?.id);
  const location = useLocation();
  const navigationState = location.state as { error?: string; quizGenerating?: boolean } | null;
  const [errorBanner, setErrorBanner] = useState<string | null>(() => navigationState?.error ?? null);
  const [quizBanner, setQuizBanner] = useState(() => Boolean(navigationState?.quizGenerating));

  const {
    data: summary,
    isLoading,
    isError: isSummaryError,
    isFetching: isSummaryFetching,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["user-summary"],
    queryFn: () => apiFetch<UserSummary>("/api/user/summary"),
    staleTime: 30_000,
    gcTime: 5 * 60_000, // keep in cache 5 min after unmount
    retry: 1,
  });
  const { data: recentScans } = useQuery({
    queryKey: ["recent-scans"],
    queryFn: () => apiFetch<{ sessions: RecentScanItem[] }>("/api/photo/recent"),
    staleTime: 15_000,
    refetchInterval: 10_000,
  });

  const loading = isLoading && !summary;
  const summaryUnavailable = isSummaryError && !summary;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Handle navigation state from Capture page
  useEffect(() => {
    window.history.replaceState({}, "");

    if (navigationState?.error) {
      const timer = setTimeout(() => setErrorBanner(null), 5000);
      return () => clearTimeout(timer);
    }

    if (navigationState?.quizGenerating) {
      const timer = setTimeout(() => setQuizBanner(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [navigationState]);

  const [lessonState] = useState(() => getCurrentLesson());
  const { lesson: todayLesson, locked: lessonLocked, unlocksInHours: lessonUnlockHours } = lessonState;
  const [lessonCompleted] = useState(() => isLessonCompleted(todayLesson.id));

  const streak = summary?.streak ?? 0;
  const kanjiLearning = summary?.kanjiLearning ?? 0;
  const kanjiFamiliar = summary?.kanjiFamiliar ?? 0;
  const wordCount = summary?.wordCount ?? 0;
  const slotRemaining = summary?.slotRemaining ?? 0;
  const slotTotal = summary?.slotTotal ?? 5;
  const slotEndsAt = summary?.slotEndsAt;
  const slotEndDate = slotEndsAt ? new Date(slotEndsAt) : null;
  const hasActiveSlot = slotEndDate != null && slotEndDate > new Date();
  const sessionState = summary?.sessionState ?? (hasActiveSlot ? (slotRemaining > 0 ? "ACTIVE" : "COOLDOWN") : "READY");
  const slotTimeLeft = slotEndDate ? formatTimeLeft(slotEndDate) : "";
  const onboardingComplete = summary?.onboardingComplete ?? false;
  const hasCollectionContent = kanjiLearning + kanjiFamiliar > 0 || wordCount > 0;
  const needsOnboarding = !onboardingComplete && !hasCollectionContent;
  const activeScan = getNewestActionableScan(localCaptures, recentScans?.sessions);

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
        title={greeting}
        subtitle={!loading && streak > 0 ? <span style={{ color: "#ff9800", fontWeight: 600 }}>You are on {streak} day streak</span> : undefined}
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
        ) : summaryUnavailable ? (
          <Paper
            role="alert"
            elevation={4}
            sx={{
              bgcolor: "#0f0f16",
              border: "1px solid rgba(211, 47, 47, 0.35)",
              borderRadius: 4,
              p: 3,
              textAlign: "center",
            }}
          >
            <ErrorOutlineIcon sx={{ fontSize: 40, color: "error.light", mb: 1.5 }} />
            <Typography fontWeight="bold" sx={{ mb: 0.5 }}>Couldn't load your progress</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              We couldn't sync your learning stats. Your collection is safe.
            </Typography>
            <Button
              variant="contained"
              onClick={() => void refetchSummary()}
              disabled={isSummaryFetching}
              sx={{ bgcolor: "#10b981", color: "black", fontWeight: "bold", px: 4, "&:hover": { bgcolor: "#34d399" } }}
            >
              Retry
            </Button>
          </Paper>
        ) : needsOnboarding ? (
          /* Onboarding not complete — prompt to start */
          <Paper elevation={4} sx={{ background: "linear-gradient(135deg, #065f46, #312e81)", color: "white", borderRadius: 4, p: 3, textAlign: "center" }}>
            <SpaIcon sx={{ fontSize: 40, color: "#6ee7b7", mb: 1.5 }} />
            <Typography fontWeight="bold" sx={{ mb: 0.5 }}>Plant Your First Seeds</Typography>
            <Typography variant="body2" sx={{ color: "#6ee7b7", opacity: 0.8, mb: 2 }}>
              Choose kanji you already know and ones you want to learn
            </Typography>
            <Button
              fullWidth
              variant="contained"
              onClick={() => navigate("/onboarding")}
              sx={{ bgcolor: "#10b981", color: "black", fontWeight: "bold", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "#34d399" } }}
            >
              Start Learning
            </Button>
          </Paper>
        ) : wordCount === 0 ? (
          /* Kanji selected but quizzes still generating */
          <Paper elevation={4} sx={{ background: "linear-gradient(135deg, #065f46, #312e81)", color: "white", borderRadius: 4, p: 3, textAlign: "center" }}>
            <SpaIcon sx={{ fontSize: 40, color: "#6ee7b7", mb: 1.5 }} />
            <Typography fontWeight="bold" sx={{ mb: 0.5 }}>Preparing Your Quizzes</Typography>
            <Typography variant="body2" sx={{ color: "#6ee7b7", opacity: 0.8, mb: 2 }}>
              We're setting up quizzes for your {kanjiLearning + kanjiFamiliar} kanji. This usually takes a moment.
            </Typography>
            <Button
              fullWidth
              variant="contained"
              onClick={() => navigate("/onboarding")}
              sx={{ bgcolor: "rgba(255,255,255,0.12)", color: "white", fontWeight: "bold", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "rgba(255,255,255,0.2)" } }}
            >
              Add More Kanji
            </Button>
          </Paper>
        ) : sessionState === "ACTIVE" ? (
          /* Active slot with quizzes remaining */
          <Paper elevation={4} sx={{ background: "linear-gradient(135deg, #065f46, #312e81)", color: "white", borderRadius: 4, p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
              <Box>
                <Typography variant="body2" sx={{ color: "#6ee7b7", mb: 0.5 }}>Session Active</Typography>
                <Typography variant="h3" fontWeight="bold" component="div">
                  {slotRemaining}{" "}
                  <Typography component="span" variant="h6" sx={{ opacity: 0.7, fontWeight: "normal" }}>remaining</Typography>
                </Typography>
              </Box>
              <Chip label={slotTimeLeft} size="small" sx={{ bgcolor: "rgba(0,0,0,0.25)", color: "inherit", fontSize: "0.75rem" }} />
            </Box>
            <Button
              fullWidth size="large" variant="contained" endIcon={<ChevronRightIcon />}
              onClick={() => navigate("/quiz")}
              sx={{ bgcolor: "#10b981", color: "black", fontWeight: "bold", fontSize: "1.1rem", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "#34d399" } }}
            >
              Continue Session
            </Button>
          </Paper>
        ) : sessionState === "COOLDOWN" ? (
          /* Slot complete — show countdown to next session */
          <Paper elevation={4} sx={{ background: "linear-gradient(135deg, #065f46, #312e81)", color: "white", borderRadius: 4, p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <CheckCircleIcon sx={{ fontSize: 20, color: "#34d399" }} />
                  <Typography variant="body2" sx={{ color: "#34d399", fontWeight: 600 }}>Session Complete</Typography>
                </Box>
                <Typography variant="h4" fontWeight="bold" component="div">
                  {slotTimeLeft}
                </Typography>
                <Typography variant="body2" sx={{ color: "#6ee7b7", opacity: 0.7 }}>
                  until next session
                </Typography>
              </Box>
            </Box>
            <Button
              fullWidth variant="contained"
              onClick={() => navigate("/capture")}
              startIcon={<CameraAltIcon />}
              sx={{ bgcolor: "rgba(255,255,255,0.12)", color: "white", fontWeight: "bold", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "rgba(255,255,255,0.2)" } }}
            >
              Capture More Kanji
            </Button>
          </Paper>
        ) : (
          /* No active slot — ready to start */
          <Paper elevation={4} sx={{ background: "linear-gradient(135deg, #065f46, #312e81)", color: "white", borderRadius: 4, p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
              <Box>
                <Typography variant="body2" sx={{ color: "#6ee7b7", mb: 0.5 }}>Ready to quiz</Typography>
                <Typography variant="h3" fontWeight="bold" component="div">
                  {slotTotal}{" "}
                  <Typography component="span" variant="h6" sx={{ opacity: 0.7, fontWeight: "normal" }}>quizzes</Typography>
                </Typography>
              </Box>
            </Box>
            <Button
              fullWidth size="large" variant="contained" endIcon={<ChevronRightIcon />}
              onClick={() => navigate("/quiz")}
              sx={{ bgcolor: "#10b981", color: "black", fontWeight: "bold", fontSize: "1.1rem", py: 1.5, borderRadius: 3, "&:hover": { bgcolor: "#34d399" } }}
            >
              Start Session
            </Button>
          </Paper>
        )}

        {activeScan && <ActiveScanCard item={activeScan} />}

        {/* Daily insight card */}
        <Paper
          variant="outlined"
          onClick={lessonLocked ? undefined : () => navigate(`/insights/${todayLesson.id}`)}
          sx={{ borderRadius: 4, p: 2.5, cursor: lessonLocked ? "default" : "pointer", opacity: lessonLocked ? 0.6 : 1, "&:hover": lessonLocked ? {} : { bgcolor: "action.hover" } }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <LightbulbOutlinedIcon sx={{ fontSize: 18, color: lessonLocked ? "text.disabled" : todayLesson.accentColor }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled", letterSpacing: 1.5, textTransform: "uppercase" }}>
                Today's Lesson
              </Typography>
            </Box>
            {lessonCompleted ? (
              <CheckCircleIcon sx={{ fontSize: 20, color: "#10b981" }} />
            ) : lessonLocked ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <LockOutlinedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled" }}>
                  {lessonUnlockHours ? `Unlocks in ${lessonUnlockHours}h` : "Locked"}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1.5, bgcolor: todayLesson.accentBg, border: "1px solid", borderColor: `${todayLesson.accentColor}4D` }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: todayLesson.accentColor }}>
                  {todayLesson.readTime}
                </Typography>
              </Box>
            )}
          </Box>
          <Typography fontWeight="bold" sx={{ mb: lessonCompleted ? 0 : 0.75, color: lessonCompleted || lessonLocked ? "text.disabled" : "text.primary" }}>
            {todayLesson.title}
          </Typography>
          {!lessonCompleted && !lessonLocked && (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {todayLesson.teaser}
            </Typography>
          )}
        </Paper>

        {/* Kanji stats card */}
        <Paper
          variant="outlined"
          onClick={() => navigate("/collection")}
          sx={{ borderRadius: 4, p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ bgcolor: "rgba(67,56,202,0.15)", p: 1.5, borderRadius: 3, display: "flex" }}>
              <MenuBookIcon sx={{ color: "#818cf8" }} />
            </Box>
            <Box>
              <Typography fontWeight="bold">Your Kanji</Typography>
              <Box sx={{ display: "flex", gap: 1.5, mt: 0.25 }}>
                <Typography variant="body2" color="primary.main" fontWeight="medium">
                  {loading || summaryUnavailable ? "–" : kanjiLearning} learning
                </Typography>
                <Typography variant="body2" color="text.disabled">•</Typography>
                <Typography variant="body2" color="text.secondary">
                  {loading || summaryUnavailable ? "–" : kanjiFamiliar} familiar
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
            <Box sx={{ bgcolor: "rgba(67,56,202,0.15)", p: 1.5, borderRadius: 3, display: "flex" }}>
              <TranslateIcon sx={{ color: "#818cf8" }} />
            </Box>
            <Box>
              <Typography fontWeight="bold">Dictionary</Typography>
              <Typography variant="body2" color="text.secondary">
                {loading || summaryUnavailable ? "–" : wordCount} saved words
              </Typography>
            </Box>
          </Box>
          <ChevronRightIcon sx={{ color: "text.disabled" }} />
        </Paper>
        {/* Recent scans */}
        {recentScans?.sessions && recentScans.sessions.length > 0 && (
          <Box>
            <Typography variant="body2" fontWeight="bold" sx={{ color: "text.secondary", mb: 1.5, px: 0.5 }}>
              Recent Scans
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {recentScans.sessions.map((scan) => (
                <RecentScanCard key={scan.sessionId} scan={scan} />
              ))}
            </Box>
          </Box>
        )}
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
          Capture Japanese
        </Button>
      </Box>
    </Box>
  );
}

function RecentScanCard({ scan }: { scan: RecentScanItem }) {
  const navigate = useNavigate();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const isDone = scan.status === "done";
  const isFailed = scan.status === "failed";

  useEffect(() => {
    if (!scan.storagePath) return;
    supabase.storage
      .from("photos")
      .createSignedUrl(scan.storagePath, 300)
      .then(({ data }) => {
        if (data?.signedUrl) setThumbnailUrl(data.signedUrl);
      });
  }, [scan.storagePath]);

  return (
    <Paper
      variant="outlined"
      onClick={() => navigate(`/scans/${scan.sessionId}`)}
      sx={{
        borderRadius: 3,
        p: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box
        component={thumbnailUrl ? "img" : "div"}
        src={thumbnailUrl ?? undefined}
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          objectFit: "cover",
          bgcolor: "grey.900",
          border: "1px solid",
          borderColor: "grey.800",
          flexShrink: 0,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: isFailed ? "error.main" : isDone ? "#10b981" : "#818cf8",
              flexShrink: 0,
              ...(!isDone && !isFailed && {
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.4 },
                },
                animation: "pulse 2s ease-in-out infinite",
              }),
            }}
          />
          <Typography variant="body2" fontWeight="bold" noWrap>
            {isFailed ? "Scan needs attention" : isDone ? `${scan.kanjiCount ?? "?"} kanji found` : "Analysing…"}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {timeAgo(scan.createdAt)}
        </Typography>
      </Box>
      <ChevronRightIcon sx={{ color: "text.disabled", flexShrink: 0 }} />
    </Paper>
  );
}

function getNewestActionableScan(
  localCaptures: import("@/lib/captureQueue").LocalCapture[] | undefined,
  serverScans: RecentScanItem[] | undefined,
): ActiveScanSource | undefined {
  const local = (localCaptures ?? [])
    .filter((capture) => capture.status !== "server-owned")
    .map((capture) => ({ source: "local" as const, capture, createdAt: capture.createdAt }));
  const server = (serverScans ?? [])
    .map((scan) => ({ source: "server" as const, scan, createdAt: scan.createdAt }));
  const newest = [...local, ...server].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!newest) return undefined;
  return newest.source === "local"
    ? { source: "local", capture: newest.capture }
    : { source: "server", scan: newest.scan };
}
