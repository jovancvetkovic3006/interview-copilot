"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scoreLevelShortLabel } from "@/lib/question-scoring";
import type { QuestionScoreEntry } from "@/types/room";
import { ListChecks } from "lucide-react";

type QuestionScoresPanelProps = {
  scores: QuestionScoreEntry[];
  onRescore?: (entry: QuestionScoreEntry) => void;
  /** Compact rows for sidebar; default false shows full panel chrome. */
  compact?: boolean;
  className?: string;
};

export function QuestionScoresPanel({
  scores,
  onRescore,
  compact = false,
  className = "",
}: QuestionScoresPanelProps) {
  if (scores.length === 0) return null;

  const ordered = [...scores].reverse();

  if (compact) {
    return (
      <div className={`space-y-1 ${className}`} data-testid="question-scores-panel">
        {ordered.map((s) => (
          <div
            key={s.id}
            className="text-[10px] rounded border border-indigo-200/80 dark:border-indigo-900/60 px-2 py-1.5 bg-white/80 dark:bg-zinc-900/80"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium shrink-0">
                {s.score}/10 · {scoreLevelShortLabel(s.score)}
              </span>
              {onRescore && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] shrink-0"
                  data-testid="question-rescore-btn"
                  onClick={() => onRescore(s)}
                >
                  Change
                </Button>
              )}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-0.5">{s.question}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="question-scores-panel"
      className={`rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 ${className}`}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-indigo-200/80 dark:border-indigo-900/50">
        <ListChecks className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">
          Question scores
        </span>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {scores.length}
        </Badge>
      </div>
      <div className="max-h-[22vh] overflow-y-auto p-2 space-y-1.5">
        {ordered.map((s) => (
          <div
            key={s.id}
            className="rounded-md border border-indigo-200/70 dark:border-indigo-900/50 bg-white/90 dark:bg-zinc-900/90 px-2.5 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="font-semibold text-indigo-900 dark:text-indigo-100">
                {s.score}/10 · {scoreLevelShortLabel(s.score)}
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                {new Date(s.scoredAt).toLocaleTimeString()}
              </span>
            </div>
            {s.category && (
              <Badge variant="secondary" className="text-[9px] mb-1">
                {s.category}
              </Badge>
            )}
            <p className="text-zinc-700 dark:text-zinc-300 leading-snug line-clamp-3">{s.question}</p>
            {onRescore && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 mt-1.5 px-2 text-[10px]"
                data-testid="question-rescore-btn"
                onClick={() => onRescore(s)}
              >
                Change score
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
