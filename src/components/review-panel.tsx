"use client";

import React from "react";
import { useInterviewStore } from "@/store/interview-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw,
  Star,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ThumbsUp,
  Loader2,
  ClipboardList,
} from "lucide-react";

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const percentage = (score / max) * 100;
  const color =
    score >= 8
      ? "bg-emerald-500"
      : score >= 6
        ? "bg-blue-500"
        : score >= 4
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-bold w-8 text-right">{score}/{max}</span>
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const config: Record<string, { label: string; variant: "success" | "default" | "warning" | "destructive" }> = {
    "strong-hire": { label: "Strong Hire", variant: "success" },
    hire: { label: "Hire", variant: "success" },
    maybe: { label: "Maybe", variant: "warning" },
    "no-hire": { label: "No Hire", variant: "destructive" },
  };

  const cfg = config[recommendation] || { label: recommendation, variant: "default" as const };

  return (
    <Badge variant={cfg.variant} className="text-base px-4 py-1">
      {recommendation === "strong-hire" || recommendation === "hire" ? (
        <ThumbsUp className="h-4 w-4 mr-1" />
      ) : recommendation === "maybe" ? (
        <AlertCircle className="h-4 w-4 mr-1" />
      ) : (
        <XCircle className="h-4 w-4 mr-1" />
      )}
      {cfg.label}
    </Badge>
  );
}

export function ReviewPanel() {
  const session = useInterviewStore((s) => s.session);
  const isGeneratingReview = useInterviewStore((s) => s.isGeneratingReview);
  const resetSession = useInterviewStore((s) => s.resetSession);

  if (!session) return null;

  if (isGeneratingReview || !session.review) {
    return (
      <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Generating Review</h2>
            <p className="text-zinc-500">
              Analyzing the interview for {session.config.intervieweeName}...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { review } = session;
  const duration = session.endedAt
    ? Math.round((session.endedAt - session.startedAt) / 60000)
    : 0;

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Interview Review</h1>
            <p className="text-zinc-500 mt-1">
              {session.config.intervieweeName} &middot; {session.config.role} &middot; {duration} min
            </p>
          </div>
          <Button variant="outline" onClick={resetSession}>
            <RotateCcw className="h-4 w-4" />
            New Interview
          </Button>
        </div>

        {/* Overall Score + Recommendation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Overall Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-6xl font-bold bg-linear-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  {review.overallScore}
                </div>
                <div className="text-zinc-500 text-sm mt-1">out of 10</div>
                <div className="mt-4">
                  <RecommendationBadge recommendation={review.recommendation} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-500" />
                Interview Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {review.summary}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Category Scores */}
        <Card>
          <CardHeader>
            <CardTitle>Category Scores</CardTitle>
            <CardDescription>Detailed breakdown by evaluation area</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {review.scores.map((score) => (
              <div key={score.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{score.category}</span>
                </div>
                <ScoreBar score={score.score} />
                <p className="text-xs text-zinc-500 mt-1">{score.comment}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
                Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {review.strengths.map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" />
                Areas for Improvement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {review.weaknesses.map((weakness, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                {review.detailedNotes}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Interviewer Notes (manual) */}
        {session.notes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Interviewer Notes</CardTitle>
              <CardDescription>Notes taken during the interview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {session.notes.map((note) => (
                  <div key={note.id} className="flex items-start gap-2 text-sm">
                    <Badge variant="secondary" className="capitalize text-xs shrink-0">
                      {note.category}
                    </Badge>
                    <span>{note.content}</span>
                    <span className="text-xs text-zinc-400 shrink-0">
                      {new Date(note.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Start New Interview */}
        <div className="text-center pb-8">
          <Button size="lg" onClick={resetSession}>
            <RotateCcw className="h-5 w-5" />
            Start New Interview
          </Button>
        </div>
      </div>
    </div>
  );
}
