import { Box, IconButton, LinearProgress, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { SessionSnapshot } from "@/lib/session";

export default function SessionHeader({ session, onExit }: { session: SessionSnapshot; onExit: () => void }) {
  const card = session.currentCard;
  const label = card?.cardType === "INTRODUCTION"
    ? (card.introductionKind === "REINTRODUCTION" ? "Let's revisit" : "New word")
    : card?.learningStep
      ? `Quick recall · Step ${card.learningStep}`
      : `Review · Tier ${card?.wordFamiliarity ?? 0}`;
  const progress = session.progress.allowance > 0
    ? (session.progress.completed / session.progress.allowance) * 100
    : 100;

  return (
    <Box sx={{ px: 3, pt: 3, pb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <IconButton aria-label="Exit session" onClick={onExit} sx={{ color: "grey.500", ml: -1 }}>
          <CloseIcon />
        </IconButton>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="caption" sx={{ color: card?.learningStep ? "#818cf8" : "#6ee7b7", fontWeight: 700, letterSpacing: 0.8 }}>
            {card?.cardType === "INTRODUCTION" ? "INTRODUCTION" : card?.learningStep ? "LEARNING STEP" : "REVIEW"}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {label} · {session.progress.remaining} {session.progress.remaining === 1 ? "review" : "reviews"} left
          </Typography>
        </Box>
        <Box sx={{ width: 40 }} />
      </Box>
      <LinearProgress
        variant="determinate"
        value={progress}
        aria-label="Session progress"
        sx={{ height: 6, borderRadius: 3, bgcolor: "#1a1a24", "& .MuiLinearProgress-bar": { bgcolor: "#10b981", borderRadius: 3 } }}
      />
    </Box>
  );
}
