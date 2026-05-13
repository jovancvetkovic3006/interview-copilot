"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSearch, FileText, Loader2, RefreshCw, Send, Sparkles, Upload, X } from "lucide-react";
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
  /**
   * Append a freshly-uploaded & parsed CV/bio file into the shared room config. The parent is
   * responsible for broadcasting it to other participants (so other hosts see it too) and for
   * persisting it on the InterviewConfig so the chat agent picks it up on the next turn.
   *
   * Optional: when omitted the panel hides the in-room upload UI and falls back to the original
   * "go back to setup" empty-state copy.
   */
  onUploadFile?: (file: UploadedFile) => void;
}

function hasCvDocs(files: UploadedFile[] | undefined): boolean {
  return !!files?.some((f) => (f.type === "cv" || f.type === "bio") && f.text?.trim().length > 50);
}

/**
 * Generates a short id for an UploadedFile. Prefers `crypto.randomUUID` (browsers + modern Node)
 * and falls back to a timestamp+random suffix in older runtimes (Safari < 15.4 etc).
 */
function newFileId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore; fall through
  }
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CvSuggestionsPanel({ config, onSendQuestion, onAssignTask, onUploadFile }: CvSuggestionsPanelProps) {
  const [data, setData] = useState<CvSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tracks the in-flight request so a fast unmount/refresh doesn't clobber state. */
  const requestIdRef = useRef(0);

  // In-panel upload (used when the host forgot to attach a CV at setup, or wants to add a bio
  // mid-interview). Mirrors the setup form's behaviour: type toggle (CV/Bio), file picker for
  // PDF/TXT/MD, then POST to /api/parse-cv to extract the text.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<"cv" | "bio">("cv");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Brief "✓ added Foo.pdf" toast right after a successful upload. */
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  /** When true, render the compact upload form even though a CV/bio is already attached. */
  const [addMoreOpen, setAddMoreOpen] = useState(false);

  const cvAvailable = hasCvDocs(config?.uploadedFiles);
  const cvBioFiles = (config?.uploadedFiles ?? []).filter((f) => f.type === "cv" || f.type === "bio");

  const handlePickFile = useCallback(() => {
    setUploadError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!onUploadFile) return;

      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse-cv", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { text?: string; fileName?: string; error?: string };
        if (!res.ok || body.error) {
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        const text = typeof body.text === "string" ? body.text : "";
        if (text.trim().length < 50) {
          // Same lower bound the panel uses to gate `cvAvailable` — refuse early so the host
          // gets a clear error instead of an "uploaded but suggestions still empty" surprise.
          throw new Error("Parsed file is too short to be useful (need ~50+ chars). Try a different file.");
        }

        const newFile: UploadedFile = {
          id: newFileId(),
          name: typeof body.fileName === "string" && body.fileName.length > 0 ? body.fileName : file.name,
          type: uploadType,
          text,
        };
        onUploadFile(newFile);
        setUploadSuccess(`Added ${newFile.name}. Generating tailored suggestions…`);
        setAddMoreOpen(false);
        // Drop any stale suggestion data so the auto-fetch effect re-runs against the freshly
        // updated config (the parent's `sendConfig` triggers a re-render with the new file).
        setData(null);
        setError(null);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onUploadFile, uploadType]
  );

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
  // `load()` mutates state, so we defer it out of the render commit phase via `queueMicrotask`
  // (and use a cancel flag for cleanup) to satisfy the React `set-state-in-effect` rule.
  useEffect(() => {
    if (data || loading || error || !cvAvailable) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [data, loading, error, cvAvailable, load]);

  // Reusable compact upload form — same controls in the empty state and in the "add another"
  // panel under the header. Only rendered when the parent supplied `onUploadFile`.
  const uploadForm = onUploadFile ? (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">Type:</span>
        {(["cv", "bio"] as const).map((t) => (
          <Badge
            key={t}
            variant={uploadType === t ? "default" : "secondary"}
            className="cursor-pointer text-[10px]"
            onClick={() => setUploadType(t)}
            title={t === "cv" ? "Tag the file as a CV / résumé" : "Tag the file as a biography"}
          >
            {t === "cv" ? "CV/Resume" : "Biography"}
          </Badge>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 px-2 text-[11px]"
          onClick={handlePickFile}
          disabled={uploading}
          title="Choose a PDF / TXT / MD file from disk"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? "Reading…" : "Upload"}
        </Button>
      </div>
      <p className="text-[10px] text-zinc-500">PDF, TXT, or MD. Same parser as the setup form.</p>
      {uploadError && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{uploadError}</p>
      )}
    </div>
  ) : null;

  if (!cvAvailable) {
    return (
      <div className="px-3 pb-3 space-y-2">
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 space-y-2.5 text-xs text-zinc-500">
          {uploadForm ? (
            <>
              <p>
                Forgot to attach a CV / bio at setup? Upload it here and the agent will generate
                tailored questions, candidate-specific coding tasks, and topics to probe — exactly
                like it would have if you&apos;d added it before the interview.
              </p>
              {uploadForm}
              {uploadSuccess && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{uploadSuccess}</p>
              )}
            </>
          ) : (
            <p>Upload a CV or bio in the interview setup to unlock CV-tailored questions and tasks.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 space-y-3">
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[11px] text-zinc-500 min-w-0 truncate">
          Private to interviewer · grounded in the uploaded CV
          {cvBioFiles.length > 0 && (
            <span className="text-zinc-400"> · {cvBioFiles.length} file{cvBioFiles.length === 1 ? "" : "s"}</span>
          )}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {onUploadFile && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setAddMoreOpen((v) => !v);
                setUploadError(null);
              }}
              title={addMoreOpen ? "Hide upload form" : "Attach another CV or bio"}
            >
              {addMoreOpen ? <X className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
              {addMoreOpen ? "Cancel" : "Add"}
            </Button>
          )}
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
      </div>

      {addMoreOpen && uploadForm && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-2.5">
          {uploadForm}
        </div>
      )}

      {uploadSuccess && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
          {uploadSuccess}
        </div>
      )}

      {cvBioFiles.length > 0 && (
        <ul className="space-y-1">
          {cvBioFiles.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/30 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-400"
              title={`${f.name} · ${f.text.length} chars`}
            >
              <FileText className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="truncate flex-1">{f.name}</span>
              <Badge variant="secondary" className="text-[9px] py-0 px-1.5 capitalize shrink-0">
                {f.type === "cv" ? "CV" : "Bio"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

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
