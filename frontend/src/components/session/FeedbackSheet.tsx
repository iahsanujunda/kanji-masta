import { Box, Button, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { SessionCard, SessionFeedback } from "@/lib/session";
import KanjiBreakdown from "@/components/session/KanjiBreakdown";

const copy = {
  CORRECT: ["Correct!", "Nice work — this review is moving forward."],
  LEARNED: ["Learned!", "You recalled it. This word now joins your review cycle."],
  NOT_YET: ["Not yet", "No penalty. You’ll see this word again before the session ends."],
  REVISIT_LATER: ["We’ll revisit this", "This word will return in a future session."],
  INCORRECT: ["Not quite", "Review the answer, then keep going."],
  INTRODUCED: ["Introduced", "The first recall is coming later in this session."],
} as const;

export default function FeedbackSheet({ feedback, answeredCard, onContinue }: { feedback: SessionFeedback; answeredCard: SessionCard; onContinue: () => void }) {
  const positive = feedback.type === "CORRECT" || feedback.type === "LEARNED";
  const neutral = feedback.type === "NOT_YET" || feedback.type === "REVISIT_LATER";
  const [title, body] = copy[feedback.type];
  const accent = positive ? "#34d399" : neutral ? "#818cf8" : "#f87171";
  const surface = positive ? "rgba(6,95,70,0.97)" : neutral ? "rgba(30,27,75,0.98)" : "rgba(127,29,29,0.97)";

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ position: "absolute", inset: "auto 0 0", zIndex: 20, p: 3, pb: "max(24px, env(safe-area-inset-bottom))", bgcolor: surface, backdropFilter: "blur(14px)", borderTop: `1px solid ${accent}66`, borderRadius: "24px 24px 0 0", boxShadow: "0 -16px 50px rgba(0,0,0,0.45)" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        {positive && <CheckIcon sx={{ color: accent }} />}
        <Typography variant="h6" fontWeight={800} sx={{ color: accent }}>{title}</Typography>
      </Box>
      {feedback.correctAnswer && !positive && (
        <Typography sx={{ mb: 1.5 }}>
          <Typography component="span" color="text.secondary">Answer: </Typography>
          <Typography component="span" fontWeight={800}>{feedback.correctAnswer}</Typography>
        </Typography>
      )}
      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.76)", lineHeight: 1.6, mb: feedback.kanjiBreakdown.length ? 2 : 3 }}>{body}</Typography>
      {!positive && <KanjiBreakdown items={feedback.kanjiBreakdown.length ? feedback.kanjiBreakdown : answeredCard.kanjiBreakdown} />}
      <Button
        fullWidth
        onClick={onContinue}
        endIcon={<ArrowForwardIcon />}
        sx={{ mt: 3, minHeight: 50, borderRadius: 3, bgcolor: positive ? "#10b981" : neutral ? "#818cf8" : "#f87171", color: "#050508", fontWeight: 800, "&:hover": { filter: "brightness(1.08)" } }}
      >
        Continue
      </Button>
    </Box>
  );
}
