"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CheckCircle2, ClipboardList, Loader2, Send } from "lucide-react";
import {
  PreTaskNotFoundError,
  getPreTask,
  submitPreTask,
} from "@/lib/pretask-client";
import type { PreTaskState } from "@/types/pretask";
import type { editor } from "monaco-editor";

// Monaco can't render server-side; load it client-only.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const DRAFT_PREFIX = "pretask-draft:";

export default function PreTaskCandidatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const upperCode = (code ?? "").toUpperCase();
  const draftKey = `${DRAFT_PREFIX}${upperCode}`;

  const [state, setState] = useState<PreTaskState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [candidateName, setCandidateName] = useState("");
  const [code_, setCode] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const seededRef = useRef(false);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Initial state already has loading=true / state=null / loadError=null. Don't reset synchronously
  // here (forbidden by react-hooks/set-state-in-effect); page remounts on URL change anyway.
  useEffect(() => {
    let cancelled = false;
    getPreTask(upperCode)
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof PreTaskNotFoundError) {
          setLoadError("This task code does not exist or was mistyped.");
        } else {
          setLoadError(err instanceof Error ? err.message : "Failed to load task");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [upperCode]);

  // Initial editor contents: localStorage draft → starter code → "".
  useEffect(() => {
    if (!state || seededRef.current) return;
    seededRef.current = true;
    const draft = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
    setCode(draft ?? state.def.starterCode ?? "");
  }, [state, draftKey]);

  // Autosave draft as the candidate types.
  useEffect(() => {
    if (!seededRef.current) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(draftKey, code_);
    } catch {
      /* quota / disabled storage — silently skip */
    }
  }, [code_, draftKey]);

  const language = state?.def.language ?? "javascript";
  const alreadySubmitted = !!state?.submission && !justSubmitted;

  const handleSubmit = useCallback(async () => {
    if (!state) return;
    if (code_.trim().length === 0) {
      setSubmitError("Add some code before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const next = await submitPreTask(upperCode, {
        code: code_,
        candidateName: candidateName.trim() || undefined,
      });
      setState(next);
      setJustSubmitted(true);
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [state, code_, candidateName, upperCode, draftKey]);

  const previousSubmissionAt = state?.submission
    ? new Date(state.submission.submittedAt).toLocaleString()
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Task not available</CardTitle>
            <CardDescription>{loadError ?? "Unknown error."}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Double-check the link your interviewer sent you. The code is case-insensitive.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (justSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-xl">Submission received</CardTitle>
            <CardDescription>Thanks{candidateName ? `, ${candidateName}` : ""} — your interviewer will review your code.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
              You can close this tab. If you spot a mistake, you can re-open this link and submit again.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setJustSubmitted(false)}>
                Edit and re-submit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-semibold text-sm truncate">{state.def.title}</h1>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Badge variant="secondary" className="text-[10px]">{language}</Badge>
                <span className="font-mono">{upperCode}</span>
                {alreadySubmitted && previousSubmissionAt && (
                  <span className="text-amber-600 dark:text-amber-500">
                    Already submitted at {previousSubmissionAt} — re-submitting will replace it.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="Your name (optional)"
              className="hidden sm:block w-48 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={handleSubmit} disabled={submitting} size="sm">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {state.def.description && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 px-4 py-3">
          <div className="max-w-6xl mx-auto">
            <details open className="text-sm text-zinc-700 dark:text-zinc-300">
              <summary className="cursor-pointer font-medium">Task description</summary>
              <p className="mt-2 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                {state.def.description}
              </p>
            </details>
          </div>
        </div>
      )}

      {submitError && (
        <div className="border-b border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          <div className="max-w-6xl mx-auto">{submitError}</div>
        </div>
      )}

      <main className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={language}
          theme="vs-dark"
          value={code_}
          onChange={(v) => setCode(v ?? "")}
          onMount={(ed) => {
            editorRef.current = ed;
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </main>
    </div>
  );
}
