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
          <Typography sx={{ mt: 1, color: "#818cf8", letterSpacing: 2 }}>{card.reading}</Typography>
          <Typography sx={{ mt: 1.25, fontSize: "1.35rem", fontWeight: 700, color: "#34d399" }}>{card.meaning}</Typography>
        </Box>
        <KanjiBreakdown items={card.kanjiBreakdown} />
        {card.exampleSentence && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, textAlign: "left", bgcolor: "#0f0f16", borderColor: "rgba(129,140,248,0.22)" }}>
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
        sx={{ minHeight: 52, borderRadius: 3, bgcolor: "#10b981", color: "#050508", fontWeight: 800, boxShadow: "0 0 30px rgba(16,185,129,0.3)", "&:hover": { bgcolor: "#34d399" } }}
      >
        {submitting ? "Saving…" : "Got it"}
      </Button>
    </Box>
  );
}
