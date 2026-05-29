"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { QuizNotFoundError, getAsyncQuiz, buildQuizCandidateUrl } from "@/lib/quiz-client";

export default function QuizManagePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = (code ?? "").toUpperCase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [def, setDef] = useState<Awaited<ReturnType<typeof getAsyncQuiz>>["def"] | null>(null);
  const [submission, setSubmission] = useState<Awaited<ReturnType<typeof getAsyncQuiz>>["submission"]>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getAsyncQuiz(upperCode)
        .then((s) => {
          if (cancelled) return;
          setDef(s.def);
          setSubmission(s.submission);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof QuizNotFoundError) setError("Quiz not found.");
          else setError(err instanceof Error ? err.message : "Failed to load");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [upperCode]);

  const shareUrl = buildQuizCandidateUrl(upperCode);

  const copyLink = () => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !def) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const correct = submission
    ? submission.answers.filter((a) => {
        const q = def.questions.find((qq) => qq.id === a.questionId);
        return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
      }).length
    : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/quiz/new" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
          <ArrowLeft className="h-4 w-4" /> New quiz
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{def.title}</CardTitle>
            <CardDescription>
              Code: <span className="font-mono font-bold">{upperCode}</span> · {def.track}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {def.questions.length} questions · {def.secondsPerQuestion / 60} min each
            </p>
            {submission ? (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-4" data-testid="async-quiz-submitted">
                <p className="font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Submitted by {submission.candidateName || "candidate"}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  Score: {correct}/{def.questions.length} correct (
                  {Math.round((correct / def.questions.length) * 100)}%)
                </p>
              </div>
            ) : (
              <Badge variant="secondary">Waiting for candidate submission…</Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
