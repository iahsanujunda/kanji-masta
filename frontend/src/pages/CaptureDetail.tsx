import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  LinearProgress,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassTopOutlinedIcon from "@mui/icons-material/HourglassTopOutlined";
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined";
import PageHeader from "@/components/PageHeader";
import FamiliarityDots from "@/components/FamiliarityDots";
import { useAuth } from "@/hooks/useAuth";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { apiFetch } from "@/lib/api";
import {
  eligibleRecommendationSelection,
  MAX_RECOMMENDATION_SELECTIONS,
  nextVisibleRecommendationCount,
  RECOMMENDATION_PAGE_SIZE,
  recommendationCandidates,
  toggleRecommendationSelection,
} from "@/lib/captureKanjiRecommendations";
import { queryKeys } from "@/lib/queryKeys";
import type { CaptureDetail, CaptureKanjiItem } from "@/lib/photo";
import type { CaptureWordCandidate } from "@/lib/photo";

export default function CaptureDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [translationOpen, setTranslationOpen] = useState(false);
  const [allKanjiOpen, setAllKanjiOpen] = useState(false);
  const [deselectedWordIds, setDeselectedWordIds] = useState<Set<string>>(new Set());
  const [storedRecommendationView, setRecommendationView] = useState(() => createRecommendationView(sessionId));
  const recommendationView = storedRecommendationView.sessionId === sessionId
    ? storedRecommendationView
    : createRecommendationView(sessionId);
  const query = useQuery({
    queryKey: queryKeys.capture(user?.id ?? "", sessionId),
    queryFn: () => apiFetch<CaptureDetail>(`/api/captures/${sessionId}`),
    enabled: Boolean(user && sessionId),
    refetchInterval: (state) => {
      const data = state.state.data;
      return data?.status === "processing" || data?.wordDiscovery.status === "PENDING" || data?.wordDiscovery.status === "PROCESSING" ? 2_000 : false;
    },
  });
  const photo = useSignedPhotoUrl(query.data?.storagePath).data;
  const loadedCaptureId = query.data?.sessionId;

  useEffect(() => {
    if (!loadedCaptureId || !sessionId) return;
    void apiFetch(`/api/captures/${sessionId}/revisited`, { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["captures", user?.id] }))
      .catch(() => undefined);
  }, [loadedCaptureId, queryClient, sessionId, user?.id]);
  const newCandidateIds = query.data?.wordDiscovery.candidates
    .filter((candidate) => candidate.learningState === "NEW")
    .map((candidate) => candidate.candidateId) ?? [];
  const selectedWordIds = new Set(newCandidateIds.filter((candidateId) => !deselectedWordIds.has(candidateId)));

  const learningMutation = useMutation({
    mutationFn: (selections: Array<{ kanjiMasterId: string; status: "learning" | "familiar" }>) => apiFetch("/api/kanji/session", {
      method: "POST",
      body: JSON.stringify({ sessionId, selections }),
    }),
    onSuccess: async (_, selections) => {
      const learnedIds = selections
        .filter((selection) => selection.status === "learning")
        .map((selection) => selection.kanjiMasterId);
      if (learnedIds.length > 0) {
        setRecommendationView((current) => {
          if (current.sessionId !== sessionId) return current;
          const next = new Set(current.selectedIds);
          learnedIds.forEach((id) => next.delete(id));
          return { ...current, selectedIds: next };
        });
      }
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: queryKeys.userSummary(user?.id ?? "") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.kanjiList(user?.id ?? "") }),
        queryClient.invalidateQueries({ queryKey: ["captures", user?.id] }),
      ]);
    },
  });

  const exclusionMutation = useMutation({
    mutationFn: ({ item, excluded }: { item: CaptureKanjiItem; excluded: boolean }) => apiFetch<CaptureDetail>(
      `/api/captures/${sessionId}/kanji/${item.kanjiMasterId}/exclusion`,
      { method: "POST", body: JSON.stringify({ excluded }) },
    ),
    onSuccess: (capture) => {
      queryClient.setQueryData(queryKeys.capture(user?.id ?? "", sessionId), capture);
      void queryClient.invalidateQueries({ queryKey: ["captures", user?.id] });
    },
  });
  const retryMutation = useMutation({
    mutationFn: (taskType?: "VISUAL_ANALYSIS" | "TRANSLATION") => apiFetch(
      taskType ? `/api/captures/${sessionId}/tasks/${taskType}/retry` : `/api/captures/${sessionId}/retry`,
      { method: "POST" },
    ),
    onSuccess: () => query.refetch(),
  });
  const wordDiscoveryMutation = useMutation({
    mutationFn: (retry: boolean) => apiFetch(
      retry
        ? `/api/captures/${sessionId}/tasks/CAPTURE_WORD_DISCOVERY/retry`
        : `/api/captures/${sessionId}/word-discovery`,
      { method: "POST" },
    ),
    onSuccess: async () => {
      await query.refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["photo-activity", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["photo-activity-unseen", user?.id] }),
      ]);
    },
  });
  const wordDecisionMutation = useMutation({
    mutationFn: (candidateIds: string[]) => apiFetch(`/api/captures/${sessionId}/word-decisions`, {
      method: "PUT",
      body: JSON.stringify({ candidateIds }),
    }),
    onSuccess: async () => {
      await query.refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["words", user?.id] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userSummary(user?.id ?? "") }),
      ]);
    },
  });

  if (query.isLoading) return <CaptureDetailSkeleton />;
  if (query.isError || !query.data) {
    return (
      <PageShell title="Capture">
        <Box role="alert" sx={{ px: 3, py: 8, textAlign: "center" }}>
          <ErrorOutlineIcon sx={{ fontSize: 38, color: "error.light", mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800}>This capture is unavailable</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Check your connection and try again.</Typography>
          <Button variant="contained" onClick={() => void query.refetch()} sx={primaryButtonSx}>Try again</Button>
        </Box>
      </PageShell>
    );
  }

  const capture = query.data;
  const activeRequiredTask = capture.tasks?.find((task) => task.status === "pending" || task.status === "processing");
  const failedRequiredTask = capture.tasks?.find((task) => task.status === "failed");
  if (capture.status === "processing") {
    const translating = activeRequiredTask?.taskType === "TRANSLATION";
    return (
      <PageShell title="Capture">
        <Box sx={{ px: 3, py: 8, textAlign: "center" }} role="status">
          <HourglassTopOutlinedIcon sx={{ fontSize: 38, color: "secondary.light", mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800}>{translating ? "Translation in progress" : "Analysing your capture"}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
            {translating
              ? `Visual analysis is complete${capture.totalKanji > 0 ? ` · ${capture.totalKanji} kanji found` : ""}. Translation runs independently.`
              : "Progress remains available in Activity. It is safe to leave this page."}
          </Typography>
          <LinearProgress sx={{ borderRadius: 2, bgcolor: "background.elevated" }} />
        </Box>
      </PageShell>
    );
  }
  if (capture.status === "needs_attention") {
    const translationFailed = failedRequiredTask?.taskType === "TRANSLATION";
    return (
      <PageShell title="Capture">
        <Box role="alert" sx={{ px: 3, py: 8, textAlign: "center" }}>
          <ErrorOutlineIcon sx={{ fontSize: 38, color: "error.light", mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800}>{translationFailed ? "Translation needs attention" : "Capture needs attention"}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
            {translationFailed
              ? "Your visual analysis is safely saved. Retry runs translation only and will not analyse the photo again."
              : "Retry keeps this photo and reruns only the failed visual-analysis task."}
          </Typography>
          <Button variant="contained" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate(failedRequiredTask?.taskType)} sx={primaryButtonSx}>{retryMutation.isPending ? "Retrying…" : translationFailed ? "Retry translation" : "Retry processing"}</Button>
          {retryMutation.isError && <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1.5 }}>This capture could not be retried yet.</Typography>}
          <Button onClick={() => navigate("/home")} sx={{ minHeight: 48, mt: 1 }}>Back to Home</Button>
        </Box>
      </PageShell>
    );
  }

  const recommendationPool = recommendationCandidates(capture.kanji);
  const visibleRecommendations = recommendationPool.slice(0, recommendationView.visibleCount);
  const eligibleSelectedKanjiIds = eligibleRecommendationSelection(recommendationView.selectedIds, recommendationPool);
  const selectedRecommendations = recommendationPool.filter((item) => eligibleSelectedKanjiIds.has(item.kanjiMasterId));
  const remainingRecommendationCount = recommendationPool.length - visibleRecommendations.length;
  const active = capture.kanji.filter((item) => !item.excluded);
  const excluded = capture.kanji.filter((item) => item.excluded);
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(capture.createdAt));
  const coverageLabel = capture.totalKanji === 0 ? "Kanji coverage N/A" : `${capture.familiarKanji} / ${capture.totalKanji} familiar`;

  return (
    <PageShell title="Capture" subtitle={date}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        <Box component="img" src={photo} alt="Captured Japanese text" sx={{ width: "100%", maxHeight: 300, aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 4, bgcolor: "background.paper", border: "1px solid", borderColor: "app.border.default" }} />

        {capture.fullText && (
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "background.paper", borderColor: "background.elevated" }}>
            <Typography variant="caption" sx={eyebrowSx}>Detected text</Typography>
            <Typography lang="ja" sx={{ mt: 1, whiteSpace: "pre-wrap", lineHeight: 1.85, fontSize: 17 }}>{capture.fullText}</Typography>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "background.paper", borderColor: "background.elevated" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <Box>
              <Typography variant="caption" sx={eyebrowSx}>Kanji coverage</Typography>
              <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>{coverageLabel}</Typography>
            </Box>
            {capture.coveragePercent != null && <Typography variant="h5" fontWeight={800} sx={{ color: capture.coveragePercent === 100 ? "primary.light" : "app.accent.secondaryPale" }}>{capture.coveragePercent}%</Typography>}
          </Box>
          {capture.coveragePercent != null && <LinearProgress variant="determinate" value={capture.coveragePercent} sx={{ mt: 1.5, height: 6, borderRadius: 3, bgcolor: "background.elevated", "& .MuiLinearProgress-bar": { bgcolor: capture.coveragePercent === 100 ? "primary.main" : "secondary.main" } }} />}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {capture.totalKanji === 0 ? "No supported kanji were detected. You can still use the translation." : `${active.filter((item) => item.learningState === "LEARNING").length} learning · ${active.filter((item) => item.learningState === "NOT_STARTED").length} not started`}
          </Typography>
        </Paper>

        {recommendationPool.length > 0 && (
          <Paper sx={{ p: 2.5, borderRadius: 4, background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.72)}, ${alpha(theme.palette.secondary.dark, 0.72)})`, border: "1px solid", borderColor: "app.tone.secondary.border" }}>
            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1.5 }}>
              <Typography variant="caption" sx={{ ...eyebrowSx, color: "app.accent.secondaryPale" }}>Kanji to explore</Typography>
              <Typography variant="caption" color="text.secondary">{visibleRecommendations.length} of {recommendationPool.length} shown</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Select up to three kanji. You can keep browsing even while learning your current batch.
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.25, my: 2 }}>
              {visibleRecommendations.map((item) => (
                <RecommendationTile
                  key={item.kanjiMasterId}
                  item={item}
                  selected={eligibleSelectedKanjiIds.has(item.kanjiMasterId)}
                  selectionLimitReached={eligibleSelectedKanjiIds.size >= MAX_RECOMMENDATION_SELECTIONS}
                  onToggle={() => setRecommendationView((current) => {
                    const activeView = current.sessionId === sessionId ? current : createRecommendationView(sessionId);
                    return {
                      ...activeView,
                      selectedIds: toggleRecommendationSelection(
                        eligibleRecommendationSelection(activeView.selectedIds, recommendationPool),
                        item.kanjiMasterId,
                      ),
                    };
                  })}
                />
              ))}
            </Box>
            {remainingRecommendationCount > 0 && (
              <Button
                fullWidth
                variant="outlined"
                onClick={() => setRecommendationView((current) => {
                  const activeView = current.sessionId === sessionId ? current : createRecommendationView(sessionId);
                  return {
                    ...activeView,
                    visibleCount: nextVisibleRecommendationCount(activeView.visibleCount, recommendationPool.length),
                  };
                })}
                sx={{ minHeight: 48, mb: 1.25, borderColor: "app.tone.secondary.strongBorder", color: "app.accent.secondaryPale" }}
              >
                Load {Math.min(RECOMMENDATION_PAGE_SIZE, remainingRecommendationCount)} more
              </Button>
            )}
            <Button
              fullWidth
              variant="contained"
              disabled={learningMutation.isPending || selectedRecommendations.length === 0 || !capture.batchGateSatisfied}
              onClick={() => learningMutation.mutate(selectedRecommendations.map((item) => ({ kanjiMasterId: item.kanjiMasterId, status: "learning" })))}
              sx={primaryButtonSx}
            >
              {learningMutation.isPending ? "Adding…" : `Learn selected (${selectedRecommendations.length} / ${MAX_RECOMMENDATION_SELECTIONS})`}
            </Button>
            {!capture.batchGateSatisfied && (
              <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2.5, bgcolor: "app.tone.secondary.faint", border: "1px solid", borderColor: "app.tone.secondary.border" }}>
                <Typography variant="body2" fontWeight={800}>Finish your current batch to learn these</Typography>
                <Typography variant="caption" color="text.secondary">Browsing and selecting remain available in the meantime.</Typography>
              </Box>
            )}
            {learningMutation.isError && <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1.5 }}>These kanji could not be added. Try again.</Typography>}
          </Paper>
        )}

        {!capture.batchGateSatisfied && recommendationPool.length === 0 && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "app.tone.secondary.faint", borderColor: "app.tone.secondary.border" }}>
            <Typography fontWeight={800}>Keep learning your current batch</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>You can add another batch when every kanji already selected from this capture reaches full familiarity.</Typography>
          </Paper>
        )}

        {capture.wordDiscovery.eligible && (
          <WordDiscoveryCard
            discovery={capture.wordDiscovery}
            selectedIds={selectedWordIds}
            onToggle={(candidateId) => setDeselectedWordIds((current) => {
              const next = new Set(current);
              if (selectedWordIds.has(candidateId)) next.add(candidateId); else next.delete(candidateId);
              return next;
            })}
            onStart={() => wordDiscoveryMutation.mutate(capture.wordDiscovery.status === "FAILED")}
            onLearn={() => wordDecisionMutation.mutate([...selectedWordIds])}
            starting={wordDiscoveryMutation.isPending}
            learning={wordDecisionMutation.isPending}
            startError={wordDiscoveryMutation.isError}
            learnError={wordDecisionMutation.isError}
          />
        )}

        <Button onClick={() => setAllKanjiOpen((open) => !open)} endIcon={<ExpandMoreIcon sx={{ transform: allKanjiOpen ? "rotate(180deg)" : "none", transition: "transform 180ms" }} />} aria-expanded={allKanjiOpen} sx={{ minHeight: 48, justifyContent: "space-between", color: "app.accent.secondaryPale", px: 2 }}>
          {allKanjiOpen ? "Hide detected kanji" : "Show all detected kanji"}
        </Button>
        {allKanjiOpen && (
          <Box sx={{ display: "grid", gap: 1.25 }}>
            {active.map((item) => <KanjiRow key={item.kanjiMasterId} item={item} onExclude={() => exclusionMutation.mutate({ item, excluded: true })} onKnow={item.selectable ? () => learningMutation.mutate([{ kanjiMasterId: item.kanjiMasterId, status: "familiar" }]) : undefined} />)}
            {excluded.length > 0 && (
              <Accordion disableGutters sx={{ bgcolor: "transparent", boxShadow: "none", "&:before": { display: "none" } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 48 }}><Typography variant="body2" color="text.secondary">Corrections ({excluded.length})</Typography></AccordionSummary>
                <AccordionDetails sx={{ px: 0, display: "grid", gap: 1 }}>
                  {excluded.map((item) => <KanjiRow key={item.kanjiMasterId} item={item} onRestore={() => exclusionMutation.mutate({ item, excluded: false })} />)}
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        )}

        {capture.translation && (
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "background.paper", borderColor: "background.elevated" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><TranslateOutlinedIcon sx={{ color: "secondary.light" }} /><Typography fontWeight={800}>Translation</Typography></Box>
            {translationOpen && <Typography sx={{ mt: 1.5, lineHeight: 1.7 }}>{capture.translation}</Typography>}
            <Button onClick={() => setTranslationOpen((open) => !open)} aria-expanded={translationOpen} sx={{ minHeight: 48, mt: 1, px: 0, color: "primary.light" }}>
              {translationOpen ? "Hide translation" : "Reveal translation"}
            </Button>
          </Paper>
        )}

        <Button onClick={() => navigate("/captures")} sx={{ minHeight: 48 }}>Done</Button>
      </Box>
    </PageShell>
  );
}

function WordDiscoveryCard({
  discovery,
  selectedIds,
  onToggle,
  onStart,
  onLearn,
  starting,
  learning,
  startError,
  learnError,
}: {
  discovery: CaptureDetail["wordDiscovery"];
  selectedIds: Set<string>;
  onToggle: (candidateId: string) => void;
  onStart: () => void;
  onLearn: () => void;
  starting: boolean;
  learning: boolean;
  startError: boolean;
  learnError: boolean;
}) {
  const running = discovery.status === "PENDING" || discovery.status === "PROCESSING";
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "app.tone.primary.faint", borderColor: "app.tone.primary.border" }}>
      <CheckCircleOutlineIcon sx={{ color: "primary.light", mb: 1 }} />
      <Typography fontWeight={800}>You know every kanji in this capture.</Typography>
      {discovery.status === "NOT_STARTED" && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Some combinations may still be new.</Typography>
          <Button variant="outlined" disabled={starting} onClick={onStart} sx={{ minHeight: 48 }}>{starting ? "Starting…" : "Find new words"}</Button>
        </>
      )}
      {running && (
        <Box role="status" sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">Finding words in the captured text…</Typography>
          <LinearProgress sx={{ mt: 1.5, borderRadius: 2, bgcolor: "background.elevated" }} />
        </Box>
      )}
      {discovery.status === "FAILED" && (
        <>
          <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1, mb: 1.5 }}>Word discovery needs attention.</Typography>
          <Button variant="outlined" disabled={starting} onClick={onStart} sx={{ minHeight: 48 }}>{starting ? "Retrying…" : "Try again"}</Button>
        </>
      )}
      {discovery.status === "DONE" && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {discovery.newCount} new · {discovery.learningCount} learning · {discovery.familiarCount} familiar
          </Typography>
          {discovery.candidates.length === 0 ? (
            <Typography variant="body2">No new words were found in this capture.</Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 1 }}>
              {discovery.candidates.map((candidate) => (
                <CapturedWordRow key={candidate.candidateId} candidate={candidate} checked={selectedIds.has(candidate.candidateId)} onToggle={() => onToggle(candidate.candidateId)} />
              ))}
            </Box>
          )}
          {discovery.newCount > 0 && (
            <Button fullWidth variant="contained" disabled={learning || selectedIds.size === 0} onClick={onLearn} sx={{ ...primaryButtonSx, mt: 2 }}>
              {learning ? "Adding…" : `Learn ${selectedIds.size} ${selectedIds.size === 1 ? "word" : "words"}`}
            </Button>
          )}
        </Box>
      )}
      {startError && <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1.5 }}>Word discovery could not start. Try again.</Typography>}
      {learnError && <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1.5 }}>These words could not be added. Your selection is preserved.</Typography>}
    </Paper>
  );
}

function CapturedWordRow({ candidate, checked, onToggle }: { candidate: CaptureWordCandidate; checked: boolean; onToggle: () => void }) {
  const isNew = candidate.learningState === "NEW";
  const stateLabel = isNew ? "New" : candidate.learningState === "LEARNING" ? "Learning" : "Familiar";
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: "background.paper", borderColor: "background.elevated" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isNew && <Checkbox checked={checked} onChange={onToggle} inputProps={{ "aria-label": `Learn ${candidate.surfaceText}` }} sx={{ color: "secondary.light", "&.Mui-checked": { color: "primary.main" } }} />}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography lang="ja" fontWeight={800}>{candidate.surfaceText}</Typography>
          <Typography lang="ja" variant="caption" sx={{ color: "app.accent.secondaryPale" }}>{candidate.reading}</Typography>
          <Typography variant="body2" color="text.secondary">{candidate.meaning}</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: isNew ? "app.accent.secondaryPale" : "primary.light", fontWeight: 800 }}>{stateLabel}</Typography>
      </Box>
    </Paper>
  );
}

function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto" }}><PageHeader title={title} subtitle={subtitle} backTo="/captures" />{children}</Box>;
}

function CaptureDetailSkeleton() {
  return <PageShell title="Capture"><Box sx={{ px: 3 }}><Skeleton variant="rounded" sx={{ aspectRatio: "4 / 3", borderRadius: 4 }} /><Skeleton height={120} sx={{ mt: 2 }} /><Skeleton height={160} /></Box></PageShell>;
}

function RecommendationTile({
  item,
  selected,
  selectionLimitReached,
  onToggle,
}: {
  item: CaptureKanjiItem;
  selected: boolean;
  selectionLimitReached: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={selected ? `Remove ${item.character} from selection` : `Select ${item.character} to learn`}
      aria-pressed={selected}
      aria-disabled={selectionLimitReached && !selected}
      onClick={onToggle}
      sx={{
        minWidth: 0,
        minHeight: 104,
        p: 1.25,
        borderRadius: 3,
        border: "1px solid",
        borderColor: selected ? "secondary.light" : "app.tone.secondary.border",
        bgcolor: selected ? "app.tone.secondary.soft" : (theme) => alpha(theme.palette.background.default, 0.55),
        color: "text.primary",
        cursor: selectionLimitReached && !selected ? "not-allowed" : "pointer",
        opacity: selectionLimitReached && !selected ? 0.62 : 1,
        transition: "transform 160ms ease, background-color 160ms ease, border-color 160ms ease",
        "&:hover": { bgcolor: selected ? "app.tone.secondary.subtle" : "app.surface.hoverSubtle" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.light", outlineOffset: 2 },
        "&:active": { transform: "scale(0.98)" },
      }}
    >
      <Typography lang="ja" sx={{ fontSize: 34, lineHeight: 1.15 }}>{item.character}</Typography>
      <Typography variant="caption" noWrap sx={{ display: "block", mt: 0.75, color: selected ? "app.accent.secondaryPale" : "text.secondary" }}>
        {item.meanings[0] ?? "New kanji"}
      </Typography>
    </Box>
  );
}

function KanjiRow({ item, onExclude, onRestore, onKnow }: { item: CaptureKanjiItem; onExclude?: () => void; onRestore?: () => void; onKnow?: () => void }) {
  const stateLabel = item.excluded ? "Not in this photo" : item.learningState === "FAMILIAR" ? "Familiar" : item.learningState === "LEARNING" ? "Learning" : "Not started";
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3, bgcolor: "background.paper", borderColor: "background.elevated", opacity: item.excluded ? 0.68 : 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography lang="ja" sx={{ fontSize: 32, width: 44, textAlign: "center" }}>{item.character}</Typography>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography fontWeight={800}>{item.meanings[0] ?? stateLabel}</Typography>
          <Typography variant="caption" color="text.secondary">{stateLabel}</Typography>
          {item.familiarity != null && <Box sx={{ mt: 0.75 }}><FamiliarityDots value={item.familiarity} /></Box>}
        </Box>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
        {onKnow && <Button size="small" onClick={onKnow} sx={{ minHeight: 40 }}>Already know</Button>}
        {onExclude && <Button size="small" onClick={onExclude} sx={{ minHeight: 40, color: "text.secondary" }}>Not in this photo</Button>}
        {onRestore && <Button size="small" onClick={onRestore} sx={{ minHeight: 40, color: "app.accent.secondaryPale" }}>Undo</Button>}
      </Box>
    </Paper>
  );
}

const eyebrowSx = { color: "text.disabled", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" } as const;
const primaryButtonSx = { minHeight: 48, bgcolor: "primary.main", color: "background.default", fontWeight: 800, "&:hover": { bgcolor: "primary.light" } };

function createRecommendationView(sessionId: string | undefined) {
  return {
    sessionId,
    visibleCount: RECOMMENDATION_PAGE_SIZE,
    selectedIds: new Set<string>(),
  };
}
