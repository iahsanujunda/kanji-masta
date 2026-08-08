import { Box, Button, TextField, Typography } from "@mui/material";
import { useState } from "react";
import type { SessionCard } from "@/lib/session";

export default function QuizCard({ card, submitting, onAnswer }: { card: SessionCard; submitting: boolean; onAnswer: (answer: string) => void }) {
  const [input, setInput] = useState("");
  const freeText = card.options.length === 0;

  return (
    <Box sx={{ flex: 1, px: 3, pb: 4, display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", minHeight: 210 }}>
        <Typography variant="caption" sx={{ mb: 3, color: "grey.500", letterSpacing: 2, textTransform: "uppercase" }}>
          {(card.quizType ?? "Recall").replaceAll("_", " ")}
        </Typography>
        {card.quizType === "BOLD_WORD_MEANING" ? (
          <HighlightedPrompt prompt={card.prompt ?? ""} target={card.target ?? ""} />
        ) : (
          <Typography sx={{ fontSize: card.quizType === "MEANING_RECALL" ? "clamp(3.5rem, 18vw, 5rem)" : "clamp(2rem, 10vw, 3.5rem)", fontWeight: 600, lineHeight: 1.25 }}>
            {card.prompt}
          </Typography>
        )}
        {card.quizType === "MEANING_RECALL" && <Typography sx={{ mt: 1, color: "grey.600", letterSpacing: 2 }}>{card.reading}</Typography>}
      </Box>

      <Box sx={{ width: "100%", maxWidth: 360, mx: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
        {submitting && <Typography variant="caption" role="status" sx={{ color: "secondary.light", textAlign: "center" }}>Saving your answer…</Typography>}
        {freeText ? (
          <>
            <TextField
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && input.trim()) onAnswer(input); }}
              disabled={submitting}
              placeholder="Type your answer"
              autoFocus
              fullWidth
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: "background.paper" }, "& input": { textAlign: "center" } }}
            />
            <Button
              variant="contained"
              disabled={!input.trim() || submitting}
              onClick={() => onAnswer(input)}
              sx={{ minHeight: 50, borderRadius: 3, bgcolor: "secondary.main", color: "secondary.contrastText", fontWeight: 700, "&:hover": { bgcolor: "app.accent.secondaryHover" } }}
            >
              Check
            </Button>
          </>
        ) : card.options.map((option) => (
          <Button
            key={option}
            fullWidth
            disabled={submitting}
            onClick={() => onAnswer(option)}
            sx={{ minHeight: 50, borderRadius: 3, px: 2, bgcolor: "background.elevated", color: "grey.100", border: "1px solid", borderColor: "app.border.subtle", textTransform: "none", fontSize: "1rem", "&:hover": { bgcolor: "app.surface.interactive", borderColor: "app.tone.secondary.strongBorder" } }}
          >
            {option}
          </Button>
        ))}
      </Box>
    </Box>
  );
}

function HighlightedPrompt({ prompt, target }: { prompt: string; target: string }) {
  const parts = target ? prompt.split(target) : [prompt];
  if (parts.length !== 2) return <Typography sx={{ fontSize: "1.25rem", lineHeight: 2 }}>{prompt}</Typography>;
  return (
    <Typography sx={{ fontSize: "1.25rem", lineHeight: 2, px: 1 }}>
      {parts[0]}
      <Box component="span" sx={{ color: "app.accent.secondaryPale", fontWeight: 800, borderBottom: "2px solid", borderColor: "secondary.main", mx: 0.5 }}>{target}</Box>
      {parts[1]}
    </Typography>
  );
}
