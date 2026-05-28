import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";

export type LiveQuizStatus = "waiting" | "in-progress" | "complete";

export interface LiveQuizQuestionResult {
  index: number;
  question: string;
  picked?: string;
  correctOption: string;
  isCorrect?: boolean;
  skipped: boolean;
  timeSpentMs?: number;
}

/** Structured live-quiz snapshot for the interviewer assistant API. */
export interface LiveQuizAgentContext {
  title: string;
  status: LiveQuizStatus;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  percentCorrect: number;
  candidateName?: string;
  questions: LiveQuizQuestionResult[];
}

export function resolveQuizAnswers(
  answers: QuizAnswerEntry[],
  submission?: QuizSubmission | null
): QuizAnswerEntry[] {
  if (submission?.answers?.length) return submission.answers;
  return answers;
}

export function buildLiveQuizAgentContext(
  quiz: ActiveQuiz,
  answers: QuizAnswerEntry[],
  options?: { submission?: QuizSubmission | null; candidateStarted?: boolean }
): LiveQuizAgentContext {
  const resolved = resolveQuizAnswers(answers, options?.submission);
  const total = quiz.questions.length;
  const answered = resolved.length;
  const correct = resolved.filter((a) => {
    const q = quiz.questions.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
  }).length;

  const status: LiveQuizStatus =
    options?.submission || answered >= total
      ? "complete"
      : options?.candidateStarted || answered > 0
        ? "in-progress"
        : "waiting";

  const questions: LiveQuizQuestionResult[] = quiz.questions.map((q, qi) => {
    const a = resolved.find((x) => x.questionId === q.id);
    const skipped = !a || a.selectedIndex < 0;
    const isCorrect = !skipped && a.selectedIndex === q.correctIndex;
    return {
      index: qi + 1,
      question: q.question,
      picked: skipped ? undefined : q.options[a.selectedIndex],
      correctOption: q.options[q.correctIndex],
      isCorrect: skipped ? undefined : isCorrect,
      skipped,
      timeSpentMs: a?.timeSpentMs,
    };
  });

  return {
    title: quiz.title,
    status,
    totalQuestions: total,
    answeredCount: answered,
    correctCount: correct,
    percentCorrect: total > 0 ? Math.round((correct / total) * 100) : 0,
    candidateName: options?.submission?.candidateName,
    questions,
  };
}

/** Plain-text block for LLM system prompts. */
export function formatLiveQuizForPrompt(ctx: LiveQuizAgentContext): string {
  const who = ctx.candidateName ? ` · Candidate: ${ctx.candidateName}` : "";
  const header = `Quiz: ${ctx.title}${who}
Status: ${ctx.status}
Score: ${ctx.correctCount}/${ctx.totalQuestions} (${ctx.percentCorrect}%) · Answered: ${ctx.answeredCount}/${ctx.totalQuestions}`;

  const lines = ctx.questions.map((q) => {
    if (q.skipped) {
      return `Q${q.index}. [skipped/timed out] ${q.question}\n   Correct: ${q.correctOption}`;
    }
    const mark = q.isCorrect ? "correct" : "wrong";
    const picked = q.picked ?? "(none)";
    const extra = q.isCorrect ? "" : `\n   Correct: ${q.correctOption}`;
    const time =
      typeof q.timeSpentMs === "number" && q.timeSpentMs > 0
        ? ` · ${Math.round(q.timeSpentMs / 1000)}s`
        : "";
    return `Q${q.index}. [${mark}] ${q.question}\n   Picked: ${picked}${extra}${time}`;
  });

  return `${header}\n\nPer question:\n${lines.join("\n\n")}`;
}
