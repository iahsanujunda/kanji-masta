import { Box, Button, Paper, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import type { SessionSummary } from "@/lib/session";

export default function SessionSummaryView({ summary, onDone }: { summary: SessionSummary; onDone: () => void }) {
  const stats = [
    [summary.newWordsLearned, "new words learned"],
    [summary.reintroducedWordsLearned, "revisited words learned"],
    [summary.reviewsCorrect, "reviews correct"],
    [summary.toRevisit, "to revisit"],
  ].filter(([value]) => Number(value) > 0) as [number, string][];

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", p: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Box sx={{ width: 76, height: 76, borderRadius: "50%", bgcolor: "app.tone.primary.soft", display: "grid", placeItems: "center", boxShadow: (theme) => theme.palette.app.shadow.primarySoft, mb: 3 }}>
        <CheckIcon sx={{ color: "primary.light", fontSize: 38 }} />
      </Box>
      <Typography variant="caption" sx={{ color: "primary.light", letterSpacing: 1.5, fontWeight: 800 }}>SESSION COMPLETE</Typography>
      <Typography variant="h4" fontWeight={800} sx={{ mt: 1, mb: 1 }}>Good work today</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Your next reviews are already scheduled.</Typography>
      {stats.length > 0 && (
        <Paper variant="outlined" sx={{ width: "100%", borderRadius: 4, p: 2.5, bgcolor: "background.paper", borderColor: "app.tone.primary.border", mb: 4 }}>
          {stats.map(([value, label]) => (
            <Box key={label} sx={{ display: "flex", justifyContent: "space-between", py: 1 }}>
              <Typography color="text.secondary">{label}</Typography>
              <Typography fontWeight={800}>{value}</Typography>
            </Box>
          ))}
        </Paper>
      )}
      <Button fullWidth onClick={onDone} sx={{ minHeight: 52, borderRadius: 3, bgcolor: "primary.main", color: "background.default", fontWeight: 800, "&:hover": { bgcolor: "primary.light" } }}>Return home</Button>
    </Box>
  );
}
