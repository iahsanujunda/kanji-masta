import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  LinearProgress,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { apiFetch } from "@/lib/api";

interface QuizItem {
  id: string;
  quizType: string;
  word: string;
  wordReading: string;
  prompt: string;
  target: string;
  furigana: string | null;
  answer: string;
  options: string[];
  explanation: string | null;
  wordFamiliarity: number;
  currentTier: string;
}

interface SlotResponse {
  quizzes: QuizItem[];
  remaining: number;
  slotEndsAt: string | null;
}

export default function Quiz() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentQuiz = quizzes[currentIndex];
  const isCorrect = isAnswered && selectedOption === currentQuiz?.answer;
  const progress = quizzes.length > 0 ? (currentIndex / quizzes.length) * 100 : 0;

  useEffect(() => {
    apiFetch<SlotResponse>("/api/quiz/slot")
      .then((data) => {
        setQuizzes(data.quizzes);
        setLoading(false);
        if (data.quizzes.length === 0) setIsFinished(true);
      })
      .catch(() => {
        navigate("/");
      });
  }, [navigate]);

  const handleSelectOption = useCallback((option: string) => {
    if (isAnswered) return;
    setSelectedOption(option);
    setIsAnswered(true);

    apiFetch("/api/quiz/result", {
      method: "POST",
      body: JSON.stringify({
        quizId: currentQuiz.id,
        correct: option === currentQuiz.answer,
      }),
    }).catch(() => {});
  }, [isAnswered, currentQuiz]);

  const handleTextSubmit = useCallback(() => {
    if (isAnswered || !textInput.trim()) return;
    const trimmed = textInput.trim();
    setSelectedOption(trimmed);
    setIsAnswered(true);

    apiFetch("/api/quiz/result", {
      method: "POST",
      body: JSON.stringify({
        quizId: currentQuiz.id,
        correct: trimmed === currentQuiz.answer,
      }),
    }).catch(() => {});
  }, [isAnswered, textInput, currentQuiz]);

  const handleNext = useCallback(() => {
    if (currentIndex < quizzes.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
      setTextInput("");
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  }, [currentIndex, quizzes.length]);

  // --- Loading ---
  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">Loading quizzes...</Typography>
      </Box>
    );
  }

  // --- Finished ---
  if (isFinished) {
    return (
      <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}>
        <Box sx={{ width: 80, height: 80, bgcolor: "rgba(16, 185, 129, 0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <CheckIcon sx={{ fontSize: 40, color: "#34d399" }} />
        </Box>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
          Slot Complete!
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          You finished your {quizzes.length} reviews for this session.
        </Typography>
        <Button
          onClick={() => navigate("/")}
          sx={{ bgcolor: "grey.800", color: "white", fontWeight: "bold", py: 1.5, px: 4, borderRadius: 3, "&:hover": { bgcolor: "grey.700" } }}
        >
          Return to Home
        </Button>
      </Box>
    );
  }

  if (!currentQuiz) return null;

  // --- Active Quiz ---
  return (
    <Box sx={{ minHeight: "100vh", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Header */}
      <Box sx={{ px: 3, pt: 5, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <IconButton onClick={() => navigate("/")} sx={{ color: "grey.500" }}>
            <CloseIcon />
          </IconButton>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "grey.500" }}>
            Tier {currentQuiz.wordFamiliarity}
          </Typography>
          <Box sx={{ width: 40 }} />
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 6, borderRadius: 3, bgcolor: "grey.800", "& .MuiLinearProgress-bar": { bgcolor: "#4338ca", borderRadius: 3 } }}
        />
      </Box>

      {/* Quiz type label */}
      <Box sx={{ textAlign: "center", mt: 2, mb: 4 }}>
        <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 2, color: "grey.500", fontWeight: 500 }}>
          {currentQuiz.quizType.replace(/_/g, " ")}
        </Typography>
      </Box>

      {/* Prompt area */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", px: 3, mb: 4, minHeight: 160 }}>
        {currentQuiz.quizType === "MEANING_RECALL" && (
          <Typography sx={{ fontSize: "5rem", fontWeight: 500 }}>{currentQuiz.prompt}</Typography>
        )}
        {currentQuiz.quizType === "READING_RECOGNITION" && (
          <Typography sx={{ fontSize: "3.5rem", fontWeight: 500, letterSpacing: 4 }}>{currentQuiz.prompt}</Typography>
        )}
        {currentQuiz.quizType === "REVERSE_READING" && (
          <Typography sx={{ fontSize: "3rem", fontWeight: 500, letterSpacing: 4, color: "#a5b4fc" }}>{currentQuiz.prompt}</Typography>
        )}
        {currentQuiz.quizType === "BOLD_WORD_MEANING" && (
          <RenderHighlightedSentence prompt={currentQuiz.prompt} target={currentQuiz.target} furigana={currentQuiz.furigana} isAnswered={isAnswered} />
        )}
        {currentQuiz.quizType === "FILL_IN_THE_BLANK" && (
          <RenderGappedSentence prompt={currentQuiz.prompt} answer={currentQuiz.answer} isAnswered={isAnswered} isCorrect={isCorrect} />
        )}
      </Box>

      {/* Options area */}
      <Box sx={{ px: 3, pb: isAnswered ? 28 : 4, display: "flex", flexDirection: "column", gap: 1.5, maxWidth: 360, mx: "auto", width: "100%" }}>
        {currentQuiz.wordFamiliarity >= 5 ? (
          // Free text input
          <>
            <TextField
              fullWidth
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={isAnswered}
              placeholder="Type the word..."
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleTextSubmit(); }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 3,
                  fontSize: "1.2rem",
                  textAlign: "center",
                  bgcolor: "grey.900",
                  ...(isAnswered && {
                    borderColor: isCorrect ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
                    bgcolor: isCorrect ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
                  }),
                },
                "& input": { textAlign: "center" },
              }}
            />
            {!isAnswered && (
              <Button
                onClick={handleTextSubmit}
                disabled={!textInput.trim()}
                variant="contained"
                sx={{ py: 1.5, borderRadius: 3, bgcolor: "#4338ca", "&:hover": { bgcolor: "#3730a3" }, "&:disabled": { bgcolor: "grey.800", color: "grey.500" } }}
              >
                Check
              </Button>
            )}
          </>
        ) : (
          // Multiple choice
          currentQuiz.options.map((option, index) => {
            const isCorrectOption = option === currentQuiz.answer;
            const isSelectedWrong = option === selectedOption && !isCorrectOption;
            const isOther = isAnswered && !isCorrectOption && option !== selectedOption;

            return (
              <Button
                key={index}
                fullWidth
                onClick={() => handleSelectOption(option)}
                disabled={isAnswered}
                sx={{
                  py: 1.5, borderRadius: 3, fontSize: "1rem", fontWeight: 500, textTransform: "none", justifyContent: "center",
                  border: "2px solid",
                  ...(isAnswered && isCorrectOption ? {
                    bgcolor: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.6)", color: "#a7f3d0", boxShadow: "0 0 15px rgba(16,185,129,0.15)",
                  } : isAnswered && isSelectedWrong ? {
                    bgcolor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.4)", color: "#fca5a5",
                  } : isOther ? {
                    bgcolor: "rgba(30,30,30,0.5)", borderColor: "transparent", color: "grey.600", opacity: 0.5,
                  } : {
                    bgcolor: "grey.800", borderColor: "transparent", color: "grey.200", "&:hover": { bgcolor: "grey.700" },
                  }),
                }}
              >
                {option}
              </Button>
            );
          })
        )}
      </Box>

      {/* Feedback bottom sheet */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          transform: isAnswered ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s ease-in-out",
          p: 3,
          borderTop: "2px solid",
          borderColor: isCorrect ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)",
          bgcolor: isCorrect ? "rgba(6,78,59,0.95)" : "rgba(127,29,29,0.95)",
          backdropFilter: "blur(16px)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          {isCorrect ? (
            <CheckIcon sx={{ color: "#34d399" }} />
          ) : (
            <CloseIcon sx={{ color: "#f87171" }} />
          )}
          <Typography variant="h6" fontWeight="bold" sx={{ color: isCorrect ? "#d1fae5" : "#fee2e2" }}>
            {isCorrect ? "Correct!" : "Not quite."}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mb: 3, color: isCorrect ? "rgba(167,243,208,0.8)" : "rgba(254,202,202,0.8)", lineHeight: 1.6 }}>
          {currentQuiz.explanation}
        </Typography>
        <Button
          fullWidth
          onClick={handleNext}
          endIcon={<ArrowForwardIcon />}
          sx={{
            py: 1.5,
            borderRadius: 3,
            fontWeight: "bold",
            fontSize: "1rem",
            bgcolor: isCorrect ? "#10b981" : "#ef4444",
            color: isCorrect ? "#064e3b" : "#7f1d1d",
            "&:hover": { bgcolor: isCorrect ? "#059669" : "#dc2626" },
          }}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
}

// --- Helper components ---

function RenderHighlightedSentence({ prompt, target, furigana, isAnswered }: { prompt: string; target: string; furigana: string | null; isAnswered: boolean }) {
  const parts = prompt.split(target);
  if (parts.length !== 2) return <Typography sx={{ fontSize: "1.2rem" }}>{prompt}</Typography>;

  return (
    <Typography sx={{ fontSize: "1.2rem", fontWeight: 500, textAlign: "center", px: 2, lineHeight: 2 }}>
      {parts[0]}
      <Box component="span" sx={{ display: "inline-flex", flexDirection: "column", alignItems: "center", mx: 0.5, verticalAlign: "bottom", transform: "translateY(8px)" }}>
        <Typography component="span" sx={{ fontSize: "0.7rem", fontWeight: 700, color: "#818cf8", mb: 0.25 }}>
          {isAnswered ? furigana : "\u00A0"}
        </Typography>
        <Typography component="span" sx={{ color: "#818cf8", borderBottom: "2px solid rgba(99,102,241,0.4)", pb: 0.25 }}>
          {target}
        </Typography>
      </Box>
      {parts[1]}
    </Typography>
  );
}

function RenderGappedSentence({ prompt, answer, isAnswered, isCorrect }: { prompt: string; answer: string; isAnswered: boolean; isCorrect: boolean }) {
  const parts = prompt.split("＿＿");
  if (parts.length !== 2) return <Typography sx={{ fontSize: "1.2rem" }}>{prompt}</Typography>;

  return (
    <Typography sx={{ fontSize: "1.2rem", fontWeight: 500, textAlign: "center", px: 2, lineHeight: 2 }}>
      {parts[0]}
      {isAnswered ? (
        <Box component="span" sx={{ px: 1, fontWeight: "bold", color: isCorrect ? "#34d399" : "#f87171" }}>
          {answer}
        </Box>
      ) : (
        <Box component="span" sx={{ display: "inline-block", width: 48, borderBottom: "2px solid", borderColor: "grey.600", mx: 0.5, verticalAlign: "middle", opacity: 0.5 }} />
      )}
      {parts[1]}
    </Typography>
  );
}
