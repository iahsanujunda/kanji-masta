import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import SessionHeader from "@/components/session/SessionHeader";
import IntroductionCard from "@/components/session/IntroductionCard";
import QuizCard from "@/components/session/QuizCard";
import FeedbackSheet from "@/components/session/FeedbackSheet";
import SessionSummaryView from "@/components/session/SessionSummaryView";
import { ApiError, apiFetch } from "@/lib/api";
import type { SessionCard, SessionCommandResponse, SessionFeedback, SessionResponse, SessionSnapshot } from "@/lib/session";

interface AdvancedBody { code: "SESSION_ADVANCED"; session: SessionSnapshot }

export default function Quiz() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [pendingSession, setPendingSession] = useState<SessionSnapshot | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [answeredCard, setAnsweredCard] = useState<SessionCard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commandError, setCommandError] = useState(false);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const cardStartedAt = useRef(Date.now());

  const startQuery = useQuery({
    queryKey: ["quiz-session", "active"],
    queryFn: () => apiFetch<SessionResponse>("/api/quiz/session/start", { method: "POST" }),
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (startQuery.data) setSession(startQuery.data.session);
  }, [startQuery.data]);

  useEffect(() => {
    cardStartedAt.current = Date.now();
  }, [session?.currentCard?.cardId]);

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["user-summary"] });
    queryClient.removeQueries({ queryKey: ["quiz-session", "active"] });
    navigate("/home");
  };

  const runCommand = async (
    card: SessionCard,
    path: string,
    body: Record<string, unknown>,
    showFeedback: boolean,
  ) => {
    setSubmitting(true);
    setCommandError(false);
    try {
      const response = await apiFetch<SessionCommandResponse>(path, { method: "POST", body: JSON.stringify(body) });
      if (showFeedback) {
        setAnsweredCard(card);
        setFeedback(response.feedback);
        setPendingSession(response.session);
      } else {
        setSession(response.session);
      }
      setRetryAction(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const advanced = error.body as AdvancedBody;
        setSession(advanced.session);
        setFeedback(null);
        setPendingSession(null);
      } else {
        setCommandError(true);
        setRetryAction(() => () => void runCommand(card, path, body, showFeedback));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const acknowledge = () => {
    const card = session?.currentCard;
    if (!session || !card) return;
    const body = { cardId: card.cardId, submissionId: crypto.randomUUID(), expectedVersion: session.version };
    void runCommand(card, `/api/quiz/session/${session.slotId}/introduction`, body, false);
  };

  const answer = (value: string) => {
    const card = session?.currentCard;
    if (!session || !card) return;
    const body = {
      cardId: card.cardId,
      submissionId: crypto.randomUUID(),
      expectedVersion: session.version,
      answer: value,
      answeredInMs: Date.now() - cardStartedAt.current,
    };
    void runCommand(card, `/api/quiz/session/${session.slotId}/answer`, body, true);
  };

  const continueAfterFeedback = () => {
    if (pendingSession) setSession(pendingSession);
    setPendingSession(null);
    setFeedback(null);
    setAnsweredCard(null);
  };

  const exitSession = async () => {
    if (!session) return finish();
    setSubmitting(true);
    try {
      await apiFetch<SessionResponse>(`/api/quiz/session/${session.slotId}/exit`, { method: "POST" });
    } finally {
      finish();
    }
  };

  if (startQuery.isLoading || !session) {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "grid", placeItems: "center", p: 3, textAlign: "center" }}>
        {startQuery.isError ? (
          <Box>
            <Typography variant="h6" fontWeight={800}>Couldn’t load this session</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Your progress is safe. Try reconnecting.</Typography>
            <Button variant="contained" onClick={() => startQuery.refetch()} sx={{ bgcolor: "#10b981", color: "#050508", fontWeight: 800 }}>Try again</Button>
          </Box>
        ) : (
          <Box>
            <CircularProgress size={30} sx={{ color: "#10b981" }} />
            <Typography color="text.secondary" sx={{ mt: 2 }}>Preparing your session…</Typography>
          </Box>
        )}
      </Box>
    );
  }

  if (session.status !== "ACTIVE" || !session.currentCard) {
    return <SessionSummaryView summary={session.summary} onDone={finish} />;
  }

  const card = session.currentCard;
  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", bgcolor: "#050508" }}>
      <SessionHeader session={session} onExit={() => setExitOpen(true)} />
      {commandError && (
        <Alert
          severity="warning"
          action={<Button color="inherit" size="small" onClick={() => retryAction?.()}>Retry</Button>}
          sx={{ mx: 3, mb: 1, borderRadius: 2 }}
        >
          Couldn’t save that turn. Your answer has not been lost.
        </Alert>
      )}
      {card.cardType === "INTRODUCTION" ? (
        <IntroductionCard key={card.cardId} card={card} submitting={submitting} onAcknowledge={acknowledge} />
      ) : (
        <QuizCard key={card.cardId} card={card} submitting={submitting || Boolean(feedback)} onAnswer={answer} />
      )}
      {feedback && answeredCard && <FeedbackSheet feedback={feedback} answeredCard={answeredCard} onContinue={continueAfterFeedback} />}

      <Dialog open={exitOpen} onClose={() => setExitOpen(false)} PaperProps={{ sx: { borderRadius: 4, bgcolor: "#0f0f16", maxWidth: 400 } }}>
        <DialogTitle fontWeight={800}>Leave this session?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">Your completed reviews stay saved. Any new-word learning steps will return in a later session.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setExitOpen(false)} sx={{ color: "grey.400" }}>Keep learning</Button>
          <Button onClick={exitSession} disabled={submitting} sx={{ color: "#fca5a5" }}>Leave session</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
