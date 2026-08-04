import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Alert, Box, Paper, Skeleton, Typography } from "@mui/material";
import PageHeader from "@/components/PageHeader";
import FamiliarityDots from "@/components/FamiliarityDots";
import KanjiBreakdown from "@/components/session/KanjiBreakdown";
import { apiFetch } from "@/lib/api";
import type { KanjiBreakdownItem } from "@/lib/session";

interface WordReference {
  id: string; word: string; reading: string; meaning: string; familiarity: number; learningState: string;
  kanjiBreakdown: KanjiBreakdownItem[]; exampleSentence: string | null; exampleContext: string | null;
}

const labels: Record<string, string> = { WAITING_TO_LEARN: "New", WAITING_TO_REVISIT: "Revisit", LEARNING: "Learning", REVIEWING: "Reviewing", MASTERED: "Mastered" };

export default function WordDetail() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["word-reference", id], queryFn: () => apiFetch<WordReference>(`/api/words/${id}`), enabled: Boolean(id) });
  const word = query.data;

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto" }}>
      <PageHeader title="Word reference" subtitle="Study only · progress unchanged" backTo="/dictionary" />
      <Box sx={{ px: 3, pb: 5 }}>
        {query.isLoading && <><Skeleton variant="rounded" height={230} sx={{ borderRadius: 4, mb: 2 }} /><Skeleton variant="rounded" height={120} sx={{ borderRadius: 4 }} /></>}
        {query.isError && <Alert severity="warning">This saved word could not be loaded.</Alert>}
        {word && (
          <>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, textAlign: "center", bgcolor: "#0f0f16", borderColor: "rgba(129,140,248,0.2)" }}>
              <Typography sx={{ fontSize: "clamp(3.5rem, 17vw, 5rem)", fontWeight: 650, lineHeight: 1.1 }}>{word.word}</Typography>
              <Typography sx={{ color: "#818cf8", letterSpacing: 2, mt: 1 }}>{word.reading}</Typography>
              <Typography variant="h6" fontWeight={800} sx={{ color: "#34d399", mt: 1.5 }}>{word.meaning}</Typography>
              <Typography variant="caption" fontWeight={800} sx={{ display: "block", color: "#a5b4fc", mt: 2 }}>{word.learningState === "REVIEWING" ? `Tier ${word.familiarity}` : labels[word.learningState]}</Typography>
              {word.familiarity > 0 && <Box sx={{ display: "flex", justifyContent: "center", mt: 0.75 }}><FamiliarityDots value={word.familiarity} /></Box>}
            </Paper>
            <Box sx={{ mt: 3 }}><Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: 1 }}>KANJI BREAKDOWN</Typography><Box sx={{ mt: 1.5 }}><KanjiBreakdown items={word.kanjiBreakdown} /></Box></Box>
            {word.exampleSentence && (
              <Paper variant="outlined" sx={{ mt: 3, p: 2.5, borderRadius: 4, bgcolor: "#0f0f16", borderColor: "rgba(16,185,129,0.16)" }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: 1 }}>IN CONTEXT</Typography>
                <Typography sx={{ mt: 1.5, fontSize: "1.08rem", lineHeight: 1.9 }}>{word.exampleSentence}</Typography>
                {word.exampleContext && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{word.exampleContext}</Typography>}
              </Paper>
            )}
            <Typography variant="caption" color="text.disabled" display="block" textAlign="center" sx={{ mt: 3 }}>Opening this page does not begin learning or change your schedule.</Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
