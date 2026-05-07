"use client";

import React, { use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  PreTaskNotFoundError,
  buildPreTaskCandidateUrl,
  getPreTask,
} from "@/lib/pretask-client";
import type { PreTaskState } from "@/types/pretask";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

/** Polling cadence for the interviewer manage page (only while no submission yet). */
const POLL_INTERVAL_MS = 5000;

export default function PreTaskManagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const upperCode = (code ?? "").toUpperCase();

  const [state, setState] = useState<PreTaskState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<"candidate" | "manage" | null>(null);
  const justCreated = useSearchParamFlag("created");
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getPreTask(upperCode);
      if (cancelledRef.current) return;
      setState(next);
      setLoadError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      if (err instanceof PreTaskNotFoundError) {
        setLoadError("This task code does not exist. Did you copy the link correctly?");
      } else {
        setLoadError(err instanceof Error ? err.message : "Failed to load task");
      }
    } finally {
      if (!cancelledRef.current) setRefreshing(false);
    }
  }, [upperCode]);

  // Initial load. Inlined (not calling `refresh`) so we don't trigger a synchronous
  // setRefreshing(true) inside the effect body — react-hooks/set-state-in-effect would flag that.
  useEffect(() => {
    cancelledRef.current = false;
    getPreTask(upperCode)
      .then((s) => {
        if (cancelledRef.current) return;
        setState(s);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelledRef.current) return;
        if (err instanceof PreTaskNotFoundError) {
          setLoadError("This task code does not exist. Did you copy the link correctly?");
        } else {
          setLoadError(err instanceof Error ? err.message : "Failed to load task");
        }
      })
      .finally(() => {
        if (!cancelledRef.current) setLoading(false);
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [upperCode]);

  // Poll while no submission has arrived yet — stop once we have one.
  useEffect(() => {
    if (!state || state.submission) return;
    const handle = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [state, refresh]);

  const candidateUrl = useMemo(() => buildPreTaskCandidateUrl(upperCode), [upperCode]);
  const manageUrl = useMemo(() => {
    if (typeof window === "undefined") return `/task/${upperCode}/manage`;
    return `${window.location.origin}/task/${upperCode}/manage`;
  }, [upperCode]);

  const handleCopy = (which: "candidate" | "manage") => {
    void navigator.clipboard.writeText(which === "candidate" ? candidateUrl : manageUrl);
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

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
            <Link
              href="/task/new"
              className="text-sm text-blue-600 hover:underline"
            >
              Create a new pre-task
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { def, submission } = state;
  const submittedAtLabel = submission ? new Date(submission.submittedAt).toLocaleString() : null;
  const createdAtLabel = new Date(def.createdAt).toLocaleString();

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 p-4 py-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <Link
          href="/interview"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to interview lobby
        </Link>

        {justCreated && (
          <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-800 dark:text-green-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Task created. Send the candidate link below to your candidate. You can revisit
              this page anytime — bookmark it or copy the manage link.
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">{def.title}</CardTitle>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">{def.language}</Badge>
                    <span className="font-mono font-bold text-blue-600">{def.code}</span>
                    {def.candidateLabel && (
                      <span className="text-xs text-zinc-500">· for {def.candidateLabel}</span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
                disabled={refreshing}
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <LinkRow
                label="Candidate link"
                description="Send this to the candidate."
                value={candidateUrl}
                onCopy={() => handleCopy("candidate")}
                copied={copied === "candidate"}
              />
              <LinkRow
                label="Manage link"
                description="This page. Bookmark to revisit."
                value={manageUrl}
                onCopy={() => handleCopy("manage")}
                copied={copied === "manage"}
              />
            </div>

            {def.description && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
                  Task description
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  {def.description}
                </p>
              </details>
            )}
            <p className="text-xs text-zinc-500">Created {createdAtLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Candidate submission</CardTitle>
              {submission ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                  Submitted
                </Badge>
              ) : (
                <Badge variant="secondary">Waiting…</Badge>
              )}
            </div>
            {submission ? (
              <CardDescription>
                {submission.candidateName ? `${submission.candidateName} · ` : ""}
                Submitted {submittedAtLabel}
              </CardDescription>
            ) : (
              <CardDescription>
                This page auto-refreshes every {Math.round(POLL_INTERVAL_MS / 1000)}s while waiting.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {submission ? (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <MonacoEditor
                  height="500px"
                  language={def.language}
                  theme="vs-dark"
                  value={submission.code}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 12 },
                    wordWrap: "on",
                  }}
                />
              </div>
            ) : (
              <div className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 text-center text-sm text-zinc-500">
                The candidate hasn&apos;t submitted yet.
                <br />
                Once they hit Submit, their code appears here.
              </div>
            )}

            {submission && (
              <div className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-400">
                <p className="font-medium mb-1">Use this in a live interview</p>
                <p>
                  In the interview SetupForm → Pre-Task tab, paste the code{" "}
                  <span className="font-mono font-bold text-blue-600">{def.code}</span> to import this
                  task and submission. The AI will reference it during the interview.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LinkRow({
  label,
  description,
  value,
  onCopy,
  copied,
}: {
  label: string;
  description: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={onCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <p className="text-[11px] text-zinc-500">{description}</p>
      <div className="font-mono text-[11px] break-all text-zinc-700 dark:text-zinc-300">{value}</div>
    </div>
  );
}

/**
 * Tiny helper to read a present/absent search-param flag without `useSearchParams` Suspense
 * issues, and without a setState-in-effect (forbidden by the React Compiler lint here).
 * useSyncExternalStore returns a stable snapshot computed during render.
 */
function useSearchParamFlag(name: string): boolean {
  return useSyncExternalStore(
    () => () => {
      /* not subscribing to URL changes — this flag is read once on mount */
    },
    () => new URLSearchParams(window.location.search).has(name),
    () => false
  );
}
