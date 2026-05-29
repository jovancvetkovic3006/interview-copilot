import { resolveQuizAnswers } from "@/lib/quiz-summary";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated for length…]`;
}

/** Sanitize coding task history for the interview report prompt (mirrors /api/interview-report). */
export function sanitizeCodingTaskHistoryForReport(
  rawHistory: unknown[]
): Record<string, unknown>[] {
  const codingTaskHistorySanitized: Record<string, unknown>[] = [];
  for (const entry of rawHistory.slice(0, 40)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    if (!title) continue;
    const row: Record<string, unknown> = {
      title: truncate(title, 400),
      description: truncate(typeof e.description === "string" ? e.description : "", 8000),
      language:
        typeof e.language === "string" && e.language.trim() ? e.language.trim().slice(0, 48) : "text",
    };
    if (typeof e.collaborationTaskId === "string" && e.collaborationTaskId.trim()) {
      row.collaborationTaskId = e.collaborationTaskId.trim().slice(0, 80);
    }
    if (typeof e.source === "string" && e.source.trim()) {
      row.source = e.source.trim().slice(0, 80);
    }
    if (typeof e.recordedAt === "number" && Number.isFinite(e.recordedAt)) {
      row.recordedAt = e.recordedAt;
    }
    codingTaskHistorySanitized.push(row);
  }
  return codingTaskHistorySanitized;
}

/** Verbal quiz section for the interview report (mirrors /api/interview-report). */
export function formatQuizBlockForReport(input: {
  activeQuiz?: ActiveQuiz | null;
  quizAnswers?: QuizAnswerEntry[];
  quizSubmission?: QuizSubmission | null;
}): string {
  const quiz = input.activeQuiz;
  const resolved = resolveQuizAnswers(input.quizAnswers ?? [], input.quizSubmission);
  if (!quiz?.questions?.length || resolved.length === 0) {
    return "(none)";
  }

  const lines = resolved.map((a) => {
    const q = quiz.questions.find((qq) => qq.id === a.questionId);
    const skipped = a.selectedIndex < 0;
    const correct = !skipped && q && a.selectedIndex === q.correctIndex;
    return `- ${q?.question ?? a.questionId}: ${skipped ? "no answer / timed out" : `selected option ${a.selectedIndex + 1} (${correct ? "correct" : "incorrect"})`}`;
  });

  const correctCount = resolved.filter((a) => {
    const q = quiz.questions.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
  }).length;

  const who = input.quizSubmission?.candidateName
    ? ` (${input.quizSubmission.candidateName})`
    : "";
  return `Quiz: ${quiz.title ?? "Live quiz"}${who}\nScore: ${correctCount}/${quiz.questions.length}\n${lines.join("\n")}`;
}
