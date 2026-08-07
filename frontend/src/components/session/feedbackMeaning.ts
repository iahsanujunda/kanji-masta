import type { SessionCard, SessionFeedback } from "@/lib/session";

export function feedbackMeaning(card: SessionCard, feedback: SessionFeedback): string {
  const answerIsMeaning = card.quizType === "MEANING_RECALL" || card.quizType === "BOLD_WORD_MEANING";
  const generatedMeaning = feedback.correctAnswer?.trim() ?? "";
  const canonicalMeaning = card.meaning.trim();
  return answerIsMeaning ? generatedMeaning || canonicalMeaning : canonicalMeaning;
}
