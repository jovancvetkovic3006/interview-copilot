"use client";

import { Badge } from "@/components/ui/badge";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";
import { CheckCircle2, XCircle, Clock, HelpCircle } from "lucide-react";

interface QuizResultsSummaryProps {
  quiz: ActiveQuiz;
  answers: QuizAnswerEntry[];
  submission?: QuizSubmission | null;
  /** Shown when quiz is assigned but candidate has not started yet. */
  status?: "waiting" | "in-progress" | "complete";
}

function resolveAnswers(answers: QuizAnswerEntry[], submission?: QuizSubmission | null): QuizAnswerEntry[] {
  if (submission?.answers?.length) return submission.answers;
  return answers;
}

function AnswerBreakdown({
  quiz,
  resolved,
  showUnanswered,
}: {
  quiz: ActiveQuiz;
  resolved: QuizAnswerEntry[];
  showUnanswered: boolean;
}) {
  return (
    <ul className="space-y-1.5 max-h-48 overflow-y-auto">
      {quiz.questions
        .filter((q) => showUnanswered || resolved.some((x) => x.questionId === q.id))
        .map((q, qi) => {
          const a = resolved.find((x) => x.questionId === q.id);
          const skipped = !a || a.selectedIndex < 0;
          const isCorrect = !skipped && a.selectedIndex === q.correctIndex;
          return (
            <li
              key={q.id}
              className="text-[10px] rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1.5"
            >
              <div className="flex items-start gap-1.5">
                {skipped ? (
                  <HelpCircle className="h-3 w-3 shrink-0 text-zinc-400 mt-0.5" />
                ) : isCorrect ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="h-3 w-3 shrink-0 text-red-500 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-zinc-500">Q{qi + 1}. </span>
                  <span className="text-zinc-700 dark:text-zinc-300 line-clamp-2">{q.question}</span>
                  {!skipped && (
                    <p className="text-zinc-500 mt-0.5">
                      Picked: {q.options[a.selectedIndex]}
                      {!isCorrect && (
                        <span className="text-green-700 dark:text-green-400">
                          {" "}
                          · Correct: {q.options[q.correctIndex]}
                        </span>
                      )}
                    </p>
                  )}
                  {skipped && <p className="text-zinc-400 mt-0.5">No answer / timed out</p>}
                </div>
              </div>
            </li>
          );
        })}
    </ul>
  );
}

export function QuizResultsSummary({ quiz, answers, submission, status }: QuizResultsSummaryProps) {
  const resolved = resolveAnswers(answers, submission);
  const total = quiz.questions.length;
  const answered = resolved.length;
  const correct = resolved.filter((a) => {
    const q = quiz.questions.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
  }).length;

  const effectiveStatus =
    status ?? (submission || answered >= total ? "complete" : answered > 0 ? "in-progress" : "waiting");

  if (effectiveStatus === "waiting") {
    return (
      <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/25 p-3 text-xs text-indigo-900 dark:text-indigo-100">
        <div className="flex items-center gap-2 font-medium">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Quiz assigned — waiting for candidate to start
        </div>
        <p className="text-[10px] text-indigo-800/80 dark:text-indigo-200/80 mt-1">
          {quiz.title} · {total} questions · {quiz.secondsPerQuestion / 60} min each
        </p>
      </div>
    );
  }

  if (effectiveStatus === "in-progress") {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/25 p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-amber-950 dark:text-amber-100">Quiz in progress</span>
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {answered}/{total}
          </Badge>
        </div>
        <p className="text-[10px] text-amber-800/80 dark:text-amber-200/80 mt-1">{quiz.title}</p>
        {submission?.candidateName && (
          <p className="text-[10px] text-zinc-600 dark:text-zinc-400">Candidate: {submission.candidateName}</p>
        )}
        {answered > 0 ? (
          <AnswerBreakdown quiz={quiz} resolved={resolved} showUnanswered={false} />
        ) : (
          <p className="text-[10px] text-amber-800/80 dark:text-amber-200/80">
            Waiting for first answer…
          </p>
        )}
      </div>
    );
  }

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-zinc-900/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{quiz.title}</span>
        <Badge
          variant={pct >= 70 ? "default" : pct >= 50 ? "secondary" : "destructive"}
          className="text-[10px] tabular-nums"
        >
          {correct}/{total} ({pct}%)
        </Badge>
      </div>
      {submission?.candidateName && (
        <p className="text-[10px] text-zinc-500">Candidate: {submission.candidateName}</p>
      )}
      <AnswerBreakdown quiz={quiz} resolved={resolved} showUnanswered />
    </div>
  );
}
