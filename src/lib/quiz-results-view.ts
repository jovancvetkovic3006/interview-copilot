import { buildLiveQuizAgentContext, type LiveQuizStatus } from "@/lib/quiz-summary";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";

export type QuizScoreBadgeVariant = "default" | "secondary" | "destructive";

/** Badge tone for interviewer quiz score summary. */
export function quizScoreBadgeVariant(percentCorrect: number): QuizScoreBadgeVariant {
  if (percentCorrect >= 70) return "default";
  if (percentCorrect >= 50) return "secondary";
  return "destructive";
}

/** Derived fields for QuizResultsSummary (shared with tests). */
export function deriveQuizResultsView(
  quiz: ActiveQuiz,
  answers: QuizAnswerEntry[],
  options?: {
    submission?: QuizSubmission | null;
    status?: LiveQuizStatus;
    candidateStarted?: boolean;
  }
): {
  status: LiveQuizStatus;
  correct: number;
  total: number;
  percentCorrect: number;
  badgeVariant: QuizScoreBadgeVariant;
  showWaiting: boolean;
  showInProgress: boolean;
  showComplete: boolean;
} {
  const ctx = buildLiveQuizAgentContext(quiz, answers, {
    submission: options?.submission,
    candidateStarted: options?.candidateStarted,
  });
  const status = options?.status ?? ctx.status;
  const percentCorrect = ctx.percentCorrect;
  return {
    status,
    correct: ctx.correctCount,
    total: ctx.totalQuestions,
    percentCorrect,
    badgeVariant: quizScoreBadgeVariant(percentCorrect),
    showWaiting: status === "waiting",
    showInProgress: status === "in-progress",
    showComplete: status === "complete",
  };
}
