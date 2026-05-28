"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code2, ListChecks } from "lucide-react";
import type { CodingTaskHistoryEntry, QuizHistoryEntry } from "@/types/room";
import type { ActiveQuiz } from "@/types/quiz";

export type ActiveAssignment = "none" | "coding" | "quiz";

interface AssignmentHistoryStripProps {
  activeAssignment: ActiveAssignment;
  codingTaskHistory: CodingTaskHistoryEntry[];
  quizHistory: QuizHistoryEntry[];
  activeCodingTaskId: string | null;
  activeQuizId: string | null;
  onSelectCoding: (collaborationTaskId: string) => void;
  onSelectQuiz: (quizId: string) => void;
  /** Interviewers see richer labels; candidates get the same switcher. */
  compact?: boolean;
}

function codingTitle(entry: CodingTaskHistoryEntry): string {
  const t = entry.task as { title?: string } | null;
  return entry.title || t?.title?.trim() || "Coding task";
}

function quizTitle(entry: QuizHistoryEntry): string {
  const q = entry.quiz as ActiveQuiz | null;
  return q?.title?.trim() || "Quiz";
}

function quizProgress(entry: QuizHistoryEntry): string {
  const q = entry.quiz as ActiveQuiz | null;
  const total = q?.questions?.length ?? 0;
  const sub = entry.quizSubmission as { answers?: unknown[] } | null;
  const answers = sub?.answers?.length ? sub.answers.length : entry.answers.length;
  if (entry.quizSubmission) return "done";
  if (entry.quizCandidateStarted || answers > 0) return `${answers}/${total}`;
  return "not started";
}

export function AssignmentHistoryStrip({
  activeAssignment,
  codingTaskHistory,
  quizHistory,
  activeCodingTaskId,
  activeQuizId,
  onSelectCoding,
  onSelectQuiz,
  compact = false,
}: AssignmentHistoryStripProps) {
  const total = codingTaskHistory.length + quizHistory.length;
  if (total === 0) return null;

  return (
    <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900/60 px-3 py-2">
      {!compact && (
        <p className="text-[10px] font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">
          Session history — switch to revisit a task or quiz
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
        {codingTaskHistory.map((entry) => {
          const id = entry.collaborationTaskId;
          const active = activeAssignment === "coding" && activeCodingTaskId === id;
          return (
            <Button
              key={`code-${id}`}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={`h-7 text-[11px] gap-1 px-2 ${active ? "" : "bg-white dark:bg-zinc-950"}`}
              onClick={() => onSelectCoding(id)}
            >
              <Code2 className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[10rem]">{codingTitle(entry)}</span>
            </Button>
          );
        })}
        {quizHistory.map((entry) => {
          const active = activeAssignment === "quiz" && activeQuizId === entry.quizId;
          const prog = quizProgress(entry);
          return (
            <Button
              key={`quiz-${entry.quizId}`}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={`h-7 text-[11px] gap-1 px-2 ${active ? "" : "bg-white dark:bg-zinc-950"}`}
              onClick={() => onSelectQuiz(entry.quizId)}
            >
              <ListChecks className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[9rem]">{quizTitle(entry)}</span>
              <Badge variant="secondary" className="text-[9px] py-0 px-1 h-4 tabular-nums">
                {prog}
              </Badge>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
