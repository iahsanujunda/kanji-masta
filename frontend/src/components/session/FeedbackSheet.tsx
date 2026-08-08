import { Box, Button, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { SessionCard, SessionFeedback } from "@/lib/session";
import { feedbackMeaning } from "@/components/session/feedbackMeaning";

const copy = {
  CORRECT: ["Correct!", "Nice work — this review is moving forward."],
  LEARNED: ["Learned!", "You recalled it. This word now joins your review cycle."],
  NOT_YET: ["Not yet", "No penalty. You’ll see this word again before the session ends."],
  REVISIT_LATER: ["We’ll revisit this", "This word will return in a future session."],
  INCORRECT: ["Not quite", "Review the answer, then keep going."],
  INTRODUCED: ["Introduced", "The first recall is coming later in this session."],
} as const;

export default function FeedbackSheet({ feedback, answeredCard, onContinue }: { feedback: SessionFeedback; answeredCard: SessionCard; onContinue: () => void }) {
  const theme = useTheme();
  const positive = feedback.type === "CORRECT" || feedback.type === "LEARNED";
  const neutral = feedback.type === "NOT_YET" || feedback.type === "REVISIT_LATER" || feedback.type === "INTRODUCED";
  const [title, body] = copy[feedback.type];
  const accent = positive ? theme.palette.primary.light : neutral ? theme.palette.secondary.light : theme.palette.error.light;
  const surface = positive ? alpha(theme.palette.primary.dark, 0.98) : neutral ? alpha(theme.palette.background.elevated, 0.98) : alpha(theme.palette.error.dark, 0.32);
  const meaning = feedbackMeaning(answeredCard, feedback);
  const identity = [answeredCard.word.trim(), answeredCard.reading.trim(), meaning].filter(Boolean);
  const explanation = feedback.explanation?.trim() || answeredCard.explanation?.trim() || "";
  const detail = explanation || body;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: "absolute",
        inset: "auto 0 0",
        zIndex: 20,
        p: 3,
        pb: "max(24px, env(safe-area-inset-bottom))",
        maxHeight: "calc(var(--app-height) - 24px)",
        overflowY: "auto",
        bgcolor: surface,
        backdropFilter: "blur(14px)",
        borderTop: `1px solid ${accent}66`,
        borderRadius: "24px 24px 0 0",
        boxShadow: (theme) => theme.palette.app.shadow.sheet,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: `${accent}1f`, flexShrink: 0 }}>
          {positive ? <CheckIcon sx={{ color: accent }} /> : neutral ? <ScheduleIcon sx={{ color: accent, fontSize: 21 }} /> : <CloseIcon sx={{ color: accent }} />}
        </Box>
        <Typography component="h2" variant="h6" fontWeight={800} sx={{ color: accent }}>{title}</Typography>
      </Box>

      <Box
        role="group"
        aria-label={identity.join(", ")}
        sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 1, rowGap: 0.5, pb: 2.5, borderBottom: "1px solid", borderColor: (theme) => theme.palette.app.overlay.subtle }}
      >
        {identity.map((part, index) => (
          <Box key={`${part}-${index}`} component="span" sx={{ display: "inline-flex", alignItems: "baseline", gap: 1 }}>
            {index > 0 && <Typography component="span" aria-hidden="true" sx={{ color: "text.disabled" }}>·</Typography>}
            <Typography component="span" aria-hidden="true" sx={{ color: index === 0 ? "grey.50" : accent, fontWeight: index === 0 ? 800 : 650, fontSize: index === 0 ? "1.15rem" : "0.95rem" }}>
              {part}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ pt: 2.5 }}>
        <Typography sx={{ mb: 1, color: accent, fontSize: "0.68rem", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {explanation ? "Why it works" : "Next step"}
        </Typography>
        <Typography sx={{ color: "text.primary", fontSize: "0.95rem", lineHeight: 1.65 }}>
          {detail}
        </Typography>
      </Box>

      <Button
        autoFocus
        fullWidth
        onClick={onContinue}
        endIcon={<ArrowForwardIcon />}
        sx={{
          mt: 3,
          minHeight: 50,
          borderRadius: 3,
          bgcolor: positive ? theme.palette.primary.main : alpha(accent, 0.14),
          color: positive ? theme.palette.primary.contrastText : accent,
          border: positive ? "none" : `1px solid ${accent}4d`,
          fontWeight: 800,
          "&:hover": { bgcolor: positive ? theme.palette.primary.light : alpha(accent, 0.15) },
          "&:focus-visible": { outline: `3px solid ${accent}`, outlineOffset: 2 },
        }}
      >
        Continue
      </Button>
    </Box>
  );
}
