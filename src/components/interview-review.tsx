"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileDown, Copy, Check, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { InterviewReport } from "@/types/room";
import { downloadInterviewPdf } from "@/lib/interview-pdf";

type SessionNotesGateProps = {
  value: string;
  onChange: (v: string) => void;
  minLength: number;
  /**
   * When true, notes are accepted as-is (no min-length gate). Used when a transcript is also
   * present — notes are then optional but still pass through to the report as first-class
   * evidence alongside the transcript.
   */
  optional?: boolean;
};

type Props = {
  roomCode: string;
  report: InterviewReport | null;
  generating: boolean;
  role: "interviewer" | "candidate";
  /** Shown when the interviewer is in review but no report is in room state yet (e.g. refresh). */
  onRetryReport?: () => void;
  /**
   * When set, surfaces a host-only notes editor on the review screen. The notes feed the AI
   * report alongside the spoken transcript (neither replaces the other). Required when no
   * transcript was captured (`optional: false`); strictly additive otherwise.
   * Notes are not synced to the candidate.
   */
  sessionNotesGate?: SessionNotesGateProps;
};

export function InterviewReviewPanel({
  roomCode,
  report,
  generating,
  role,
  onRetryReport,
  sessionNotesGate,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!report?.markdown) return;
    await navigator.clipboard.writeText(report.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  const handlePdf = useCallback(() => {
    if (!report?.markdown) return;
    downloadInterviewPdf(report.markdown, roomCode);
  }, [report, roomCode]);

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex flex-col items-center p-4 py-10">
      <Card className="w-full max-w-3xl shadow-lg border-zinc-200 dark:border-zinc-800">
        <CardHeader className="border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">Interview complete</CardTitle>
              <CardDescription className="mt-1">
                Code <span className="font-mono font-semibold text-blue-600">{roomCode}</span>
                {report && (
                  <span className="block text-xs mt-1 text-zinc-500">
                    Generated {new Date(report.generatedAt).toLocaleString()}
                  </span>
                )}
              </CardDescription>
            </div>
            {report && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy Markdown"}
                </Button>
                <Button type="button" size="sm" onClick={handlePdf}>
                  <FileDown className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {generating && role === "interviewer" && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Generating summary with AI… this can take a minute.
            </div>
          )}
          {!report && !generating && role !== "interviewer" && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Waiting for the interviewer to finish generating the report…
            </div>
          )}
          {!report && !generating && role === "interviewer" && (
            <div className="space-y-3 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No summary is stored for this interview yet (for example after a refresh before generation finished).
              </p>
              {sessionNotesGate && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-3 space-y-1.5">
                  <label className="text-xs font-medium text-amber-950 dark:text-amber-100">
                    Session notes for the AI report
                    {sessionNotesGate.optional ? (
                      <span className="font-normal text-zinc-700 dark:text-zinc-300">
                        {" "}
                        — optional. Used as primary evidence alongside the live transcript (neither replaces the other).
                      </span>
                    ) : (
                      <span className="font-normal text-amber-900/90 dark:text-amber-200/90">
                        {" "}
                        — required (no live transcript was captured). At least {sessionNotesGate.minLength} characters.
                      </span>
                    )}
                  </label>
                  <textarea
                    value={sessionNotesGate.value}
                    onChange={(e) => sessionNotesGate.onChange(e.target.value)}
                    placeholder="Summarize what was discussed, candidate strengths/gaps, and your impressions…"
                    rows={4}
                    className="w-full text-sm rounded-md border border-amber-200/90 dark:border-amber-800/80 bg-white dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                  {!sessionNotesGate.optional &&
                    sessionNotesGate.value.trim().length < sessionNotesGate.minLength && (
                      <p className="text-[10px] text-amber-800 dark:text-amber-300">
                        {sessionNotesGate.minLength - sessionNotesGate.value.trim().length} more characters needed.
                      </p>
                    )}
                </div>
              )}
              {onRetryReport && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onRetryReport}
                  disabled={
                    Boolean(
                      sessionNotesGate &&
                        !sessionNotesGate.optional &&
                        sessionNotesGate.value.trim().length < sessionNotesGate.minLength
                    )
                  }
                >
                  Generate report
                </Button>
              )}
            </div>
          )}
          {report && (
            <div className="space-y-4">
              <Badge variant="secondary" className="text-xs">
                AI summary — verify before sharing externally
              </Badge>
              <article
                className="max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans text-zinc-800 dark:text-zinc-200 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-4"
              >
                {report.markdown}
              </article>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
