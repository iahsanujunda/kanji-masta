import { Box, Button, Paper, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { SessionCard } from "@/lib/session";
import KanjiBreakdown from "@/components/session/KanjiBreakdown";

export default function IntroductionCard({ card, submitting, onAcknowledge }: { card: SessionCard; submitting: boolean; onAcknowledge: () => void }) {
  return (
    <Box sx={{ flex: 1, px: 3, pb: 3, display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", gap: 2.5, py: 2 }}>
        <Box>
          <Typography sx={{ fontSize: "clamp(3.25rem, 18vw, 5rem)", lineHeight: 1.05, fontWeight: 650 }}>{card.word}</Typography>
          <Typography sx={{ mt: 1, color: "secondary.light", letterSpacing: 2 }}>{card.reading}</Typography>
          <Typography sx={{ mt: 1.25, fontSize: "1.35rem", fontWeight: 700, color: "primary.light" }}>{card.meaning}</Typography>
        </Box>
        <KanjiBreakdown items={card.kanjiBreakdown} />
        {card.exampleSentence && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, textAlign: "left", bgcolor: "background.paper", borderColor: "app.tone.secondary.border" }}>
            <Typography sx={{ fontSize: "1.05rem", lineHeight: 1.8 }}>{card.exampleSentence}</Typography>
            {card.exampleContext && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{card.exampleContext}</Typography>}
          </Paper>
        )}
      </Box>
      <Button
        fullWidth
        size="large"
        variant="contained"
        endIcon={<ArrowForwardIcon />}
        disabled={submitting}
        onClick={onAcknowledge}
        sx={{ minHeight: 52, borderRadius: 3, bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 800, boxShadow: (theme) => theme.palette.app.shadow.primaryGlow, "&:hover": { bgcolor: "primary.light" } }}
      >
        {submitting ? "Saving…" : "Got it"}
      </Button>
    </Box>
  );
}
