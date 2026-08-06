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
    onSuccess: async () => {
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
    mutationFn: () => apiFetch(`/api/captures/${sessionId}/retry`, { method: "POST" }),
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
  if (capture.status === "processing") {
    return (
      <PageShell title="Capture">
        <Box sx={{ px: 3, py: 8, textAlign: "center" }} role="status">
          <HourglassTopOutlinedIcon sx={{ fontSize: 38, color: "#818cf8", mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800}>Analysing your capture</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>Progress remains available in Activity. It is safe to leave this page.</Typography>
          <LinearProgress sx={{ borderRadius: 2, bgcolor: "#1a1a24" }} />
        </Box>
      </PageShell>
    );
  }
  if (capture.status === "needs_attention") {
    return (
      <PageShell title="Capture">
        <Box role="alert" sx={{ px: 3, py: 8, textAlign: "center" }}>
          <ErrorOutlineIcon sx={{ fontSize: 38, color: "error.light", mb: 1.5 }} />
          <Typography variant="h6" fontWeight={800}>Capture needs attention</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Retry keeps this photo and reruns only its required processing chain.</Typography>
          <Button variant="contained" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate()} sx={primaryButtonSx}>{retryMutation.isPending ? "Retrying…" : "Retry processing"}</Button>
          {retryMutation.isError && <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1.5 }}>This capture could not be retried yet.</Typography>}
          <Button onClick={() => navigate("/home")} sx={{ minHeight: 48, mt: 1 }}>Back to Home</Button>
        </Box>
      </PageShell>
    );
  }

  const recommended = capture.kanji.filter((item) => item.recommendedNext);
  const active = capture.kanji.filter((item) => !item.excluded);
  const excluded = capture.kanji.filter((item) => item.excluded);
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(capture.createdAt));
  const coverageLabel = capture.totalKanji === 0 ? "Kanji coverage N/A" : `${capture.familiarKanji} / ${capture.totalKanji} familiar`;

  return (
    <PageShell title="Capture" subtitle={date}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        <Box component="img" src={photo} alt="Captured Japanese text" sx={{ width: "100%", maxHeight: 300, aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 4, bgcolor: "#0f0f16", border: "1px solid #1a1a24" }} />

        {capture.fullText && (
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "#0f0f16", borderColor: "#1a1a24" }}>
            <Typography variant="caption" sx={eyebrowSx}>Detected text</Typography>
            <Typography lang="ja" sx={{ mt: 1, whiteSpace: "pre-wrap", lineHeight: 1.85, fontSize: 17 }}>{capture.fullText}</Typography>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "#0f0f16", borderColor: "#1a1a24" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <Box>
              <Typography variant="caption" sx={eyebrowSx}>Kanji coverage</Typography>
              <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>{coverageLabel}</Typography>
            </Box>
            {capture.coveragePercent != null && <Typography variant="h5" fontWeight={800} sx={{ color: capture.coveragePercent === 100 ? "#34d399" : "#a5b4fc" }}>{capture.coveragePercent}%</Typography>}
          </Box>
          {capture.coveragePercent != null && <LinearProgress variant="determinate" value={capture.coveragePercent} sx={{ mt: 1.5, height: 6, borderRadius: 3, bgcolor: "#1a1a24", "& .MuiLinearProgress-bar": { bgcolor: capture.coveragePercent === 100 ? "#10b981" : "#4338ca" } }} />}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {capture.totalKanji === 0 ? "No supported kanji were detected. You can still use the translation." : `${active.filter((item) => item.learningState === "LEARNING").length} learning · ${active.filter((item) => item.learningState === "NOT_STARTED").length} not started`}
          </Typography>
        </Paper>

        {recommended.length > 0 && (
          <Paper sx={{ p: 2.5, borderRadius: 4, background: "linear-gradient(135deg, rgba(6,95,70,.72), rgba(49,46,129,.72))", border: "1px solid rgba(129,140,248,.25)" }}>
            <Typography variant="caption" sx={{ ...eyebrowSx, color: "#a5b4fc" }}>Recommended next</Typography>
            <Box sx={{ display: "flex", gap: 1.25, my: 2 }}>
              {recommended.map((item) => <KanjiTile key={item.kanjiMasterId} item={item} />)}
            </Box>
            <Button
              fullWidth
              variant="contained"
              disabled={learningMutation.isPending}
              onClick={() => learningMutation.mutate(recommended.map((item) => ({ kanjiMasterId: item.kanjiMasterId, status: "learning" })))}
              sx={primaryButtonSx}
            >
              {learningMutation.isPending ? "Adding…" : `Learn these ${recommended.length}`}
            </Button>
            {learningMutation.isError && <Typography role="alert" variant="body2" color="error.light" sx={{ mt: 1.5 }}>These kanji could not be added. Try again.</Typography>}
          </Paper>
        )}

        {!capture.batchGateSatisfied && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(67,56,202,.10)", borderColor: "rgba(129,140,248,.25)" }}>
            <Typography fontWeight={800}>Keep learning your current batch</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>The next three unlock when every kanji selected from this capture reaches full familiarity.</Typography>
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

        <Button onClick={() => setAllKanjiOpen((open) => !open)} endIcon={<ExpandMoreIcon sx={{ transform: allKanjiOpen ? "rotate(180deg)" : "none", transition: "transform 180ms" }} />} aria-expanded={allKanjiOpen} sx={{ minHeight: 48, justifyContent: "space-between", color: "#a5b4fc", px: 2 }}>
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
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "#0f0f16", borderColor: "#1a1a24" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><TranslateOutlinedIcon sx={{ color: "#818cf8" }} /><Typography fontWeight={800}>Translation</Typography></Box>
            {translationOpen && <Typography sx={{ mt: 1.5, lineHeight: 1.7 }}>{capture.translation}</Typography>}
            <Button onClick={() => setTranslationOpen((open) => !open)} aria-expanded={translationOpen} sx={{ minHeight: 48, mt: 1, px: 0, color: "#34d399" }}>
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
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3.5, bgcolor: "rgba(16,185,129,.08)", borderColor: "rgba(52,211,153,.28)" }}>
      <CheckCircleOutlineIcon sx={{ color: "#34d399", mb: 1 }} />
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
          <LinearProgress sx={{ mt: 1.5, borderRadius: 2, bgcolor: "#1a1a24" }} />
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
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: "#0f0f16", borderColor: "#1a1a24" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isNew && <Checkbox checked={checked} onChange={onToggle} inputProps={{ "aria-label": `Learn ${candidate.surfaceText}` }} sx={{ color: "#818cf8", "&.Mui-checked": { color: "#10b981" } }} />}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography lang="ja" fontWeight={800}>{candidate.surfaceText}</Typography>
          <Typography lang="ja" variant="caption" sx={{ color: "#a5b4fc" }}>{candidate.reading}</Typography>
          <Typography variant="body2" color="text.secondary">{candidate.meaning}</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: isNew ? "#a5b4fc" : "#34d399", fontWeight: 800 }}>{stateLabel}</Typography>
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

function KanjiTile({ item }: { item: CaptureKanjiItem }) {
  return <Box sx={{ width: 64, height: 72, borderRadius: 3, bgcolor: "rgba(5,5,8,.55)", border: "1px solid rgba(165,180,252,.2)", display: "grid", placeItems: "center" }}><Typography lang="ja" sx={{ fontSize: 34 }}>{item.character}</Typography></Box>;
}

function KanjiRow({ item, onExclude, onRestore, onKnow }: { item: CaptureKanjiItem; onExclude?: () => void; onRestore?: () => void; onKnow?: () => void }) {
  const stateLabel = item.excluded ? "Not in this photo" : item.learningState === "FAMILIAR" ? "Familiar" : item.learningState === "LEARNING" ? "Learning" : "Not started";
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3, bgcolor: "#0f0f16", borderColor: "#1a1a24", opacity: item.excluded ? 0.68 : 1 }}>
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
        {onRestore && <Button size="small" onClick={onRestore} sx={{ minHeight: 40, color: "#a5b4fc" }}>Undo</Button>}
      </Box>
    </Paper>
  );
}

const eyebrowSx = { color: "text.disabled", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" } as const;
const primaryButtonSx = { minHeight: 48, bgcolor: "#10b981", color: "#050508", fontWeight: 800, "&:hover": { bgcolor: "#34d399" } };
