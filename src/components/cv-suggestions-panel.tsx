"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSearch, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import type { InterviewConfig, UploadedFile } from "@/types/interview";

/**
 * Side-panel section that shows interviewer-only, CV-tailored suggestions:
 * tailored questions, candidate-specific coding tasks, and topics worth probing.
 *
 * Lazy-loads on first render (the parent only mounts this when the section is expanded)
 * and caches the result for the session — re-fetching only on explicit "Refresh".
 *
 * NOTE: This component intentionally produces side effects (sendChat / sendCodingTask)
 * via callbacks supplied by the parent — it does not own room state.
 */

export interface CvSuggestion {
  question: string;
  category: string;
  rationale: string;
}

export interface CvCodingSuggestion {
  title: string;
  description: string;
  language: string;
  starterCode: string;
  difficulty?: "junior" | "mid" | "senior" | "lead";
  rationale: string;
}

export interface CvSuggestionsResponse {
  questions: CvSuggestion[];
  codingTasks: CvCodingSuggestion[];
  topicsToProbe: string[];
}

interface CvSuggestionsPanelProps {
  config: InterviewConfig | null;
  /** Send a question to the live chat (as the interviewer). */
  onSendQuestion: (question: string) => void;
  /** Assign a coding task to the shared editor. */
  onAssignTask: (task: { title: string; description: string; language: string; starterCode: string }) => void;
}

function hasCvDocs(files: UploadedFile[] | undefined): boolean {
  return !!files?.some((f) => (f.type === "cv" || f.type === "bio") && f.text?.trim().length > 50);
}

export function CvSuggestionsPanel({ config, onSendQuestion, onAssignTask }: CvSuggestionsPanelProps) {
  const [data, setData] = useState<CvSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tracks the in-flight request so a fast unmount/refresh doesn't clobber state. */
  const requestIdRef = useRef(0);

  const cvAvailable = hasCvDocs(config?.uploadedFiles);

  const load = useCallback(async () => {
    if (!config || !cvAvailable) return;
    const myReqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cv-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadedFiles: config.uploadedFiles.map((f) => ({ name: f.name, type: f.type, text: f.text })),
          role: config.role,
          difficulty: config.difficulty,
          topics: config.topics,
          candidateName: config.candidateName,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const body = (await res.json()) as CvSuggestionsResponse;
      // Guard against a stale response winning over a newer click.
      if (myReqId !== requestIdRef.current) return;
      setData({
        questions: body.questions ?? [],
        codingTasks: body.codingTasks ?? [],
        topicsToProbe: body.topicsToProbe ?? [],
      });
    } catch (err: unknown) {
      if (myReqId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      if (myReqId === requestIdRef.current) setLoading(false);
    }
  }, [config, cvAvailable]);

  // Auto-fetch the very first time the section is expanded (mounted) and CV is available.
  useEffect(() => {
    if (!data && !loading && !error && cvAvailable) {
      load();
    }
  }, [data, loading, error, cvAvailable, load]);

  if (!cvAvailable) {
    return (
      <div className="px-3 pb-3 space-y-2">
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-xs text-zinc-500">
          Upload a CV or bio in the interview setup to unlock CV-tailored questions and tasks.
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">
          Private to interviewer · grounded in the uploaded CV
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={load}
          disabled={loading}
          title="Re-generate suggestions from the CV"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {loading ? "Reading…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 p-2.5 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-500 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reading the CV and drafting tailored suggestions…
        </div>
      )}

      {data && !loading && data.questions.length === 0 && data.codingTasks.length === 0 && data.topicsToProbe.length === 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-500">
          The model didn&apos;t find anything CV-specific to suggest. Try adding more detail in the CV or click Refresh.
        </div>
      )}

      {data && data.questions.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
            <FileSearch className="h-3 w-3 text-purple-500" /> Tailored questions ({data.questions.length})
          </h4>
          {data.questions.map((q, i) => (
            <div
              key={`q-${i}`}
              className="group rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-purple-300 dark:hover:border-purple-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Badge variant="secondary" className="text-[10px] mb-1">
                    {q.category}
                  </Badge>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{q.question}</p>
                  {q.rationale && (
                    <p className="mt-1 text-[10px] text-zinc-500 italic line-clamp-2" title={q.rationale}>
                      Why: {q.rationale}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 w-7 p-0"
                  onClick={() => onSendQuestion(q.question)}
                  title="Send this question to chat"
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data && data.codingTasks.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-green-500" /> Tailored coding tasks ({data.codingTasks.length})
          </h4>
          {data.codingTasks.map((task, i) => (
            <div
              key={`t-${i}`}
              className="group rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-green-300 dark:hover:border-green-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{task.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {task.language}
                    </Badge>
                    {task.difficulty && (
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {task.difficulty}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 whitespace-pre-line max-h-40 overflow-y-auto pr-0.5">{task.description}</p>
                  {task.rationale && (
                    <p className="mt-1 text-[10px] text-zinc-500 italic line-clamp-2" title={task.rationale}>
                      Why: {task.rationale}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 px-2 text-[10px]"
                  onClick={() =>
                    onAssignTask({
                      title: task.title,
                      description: task.description,
                      language: task.language,
                      starterCode: task.starterCode,
                    })
                  }
                  title="Assign this task to the editor"
                >
                  Assign
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data && data.topicsToProbe.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Topics to probe ({data.topicsToProbe.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {data.topicsToProbe.map((t, i) => (
              <Badge key={`p-${i}`} variant="secondary" className="text-[10px] font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
