"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QUESTION_SCORE_LEVELS, scoreLevelShortLabel } from "@/lib/question-scoring";
import { ListChecks, X } from "lucide-react";

interface QuestionScorePromptProps {
  question: string;
  category?: string;
  /** When set, the interviewer is updating an existing score. */
  previousScore?: number;
  onScore: (score: number) => void;
  onDismiss: () => void;
}

export function QuestionScorePrompt({
  question,
  category,
  previousScore,
  onScore,
  onDismiss,
}: QuestionScorePromptProps) {
  const isRescore = previousScore != null;

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/90 dark:bg-indigo-950/30 p-3 space-y-2" data-testid="question-score-prompt">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <ListChecks className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">
              {isRescore ? "Update the score" : "Rate the answer"}
            </span>
            {isRescore && (
              <Badge variant="secondary" className="text-[10px]">
                was {scoreLevelShortLabel(previousScore)}
              </Badge>
            )}
            {category && (
              <Badge variant="secondary" className="text-[10px]">
                {category}
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-3">{question}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onDismiss}
          title="Dismiss"
          aria-label="Dismiss rating"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {QUESTION_SCORE_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            data-testid={`question-score-${level.value}`}
            onClick={() => onScore(level.value)}
            className={`text-left rounded-md border px-2.5 py-1.5 transition-colors ${
              previousScore === level.value
                ? "border-indigo-500 dark:border-indigo-500 bg-indigo-100/80 dark:bg-indigo-900/50 ring-1 ring-indigo-400/60"
                : "border-indigo-200/80 dark:border-indigo-800/60 bg-white/80 dark:bg-zinc-900/80 hover:border-indigo-400 dark:hover:border-indigo-600"
            }`}
          >
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{level.label}</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">{level.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
