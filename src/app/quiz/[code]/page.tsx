"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { QuizNotFoundError, getAsyncQuiz, submitAsyncQuiz } from "@/lib/quiz-client";
import type { AsyncQuizState, ActiveQuiz, QuizAnswerEntry } from "@/types/quiz";
import { LiveQuizPanel } from "@/components/live-quiz-panel";

export default function QuizCandidatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upperCode = (code ?? "").toUpperCase();

  const [state, setState] = useState<AsyncQuizState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [candidateName, setCandidateName] = useState("");
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAsyncQuiz(upperCode)
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof QuizNotFoundError) {
          setLoadError("This quiz code does not exist or was mistyped.");
        } else {
          setLoadError(err instanceof Error ? err.message : "Failed to load quiz");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [upperCode]);

  const activeQuiz: ActiveQuiz | null = state
    ? {
        quizId: state.def.code,
        templateId: state.def.templateId,
        title: state.def.title,
        questions: state.def.questions,
        secondsPerQuestion: state.def.secondsPerQuestion,
        assignedAt: state.def.createdAt,
      }
    : null;

  const handleComplete = useCallback(
    async (answers: QuizAnswerEntry[]) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const updated = await submitAsyncQuiz(upperCode, {
          answers,
          ...(candidateName.trim() ? { candidateName: candidateName.trim() } : {}),
        });
        setState(updated);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to submit quiz");
      } finally {
        setSubmitting(false);
      }
    },
    [upperCode, candidateName]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Quiz not found</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (state.submission) {
    const correct = state.submission.answers.filter((a) => {
      const q = state.def.questions.find((qq) => qq.id === a.questionId);
      return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
    }).length;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-2" />
            <CardTitle>Quiz submitted</CardTitle>
            <CardDescription>
              Thank you{state.submission.candidateName ? `, ${state.submission.candidateName}` : ""}.
              Score: {correct}/{state.def.questions.length} correct.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {state.def.title}
            </CardTitle>
            <CardDescription>{state.def.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {state.def.questions.length} questions · {state.def.secondsPerQuestion / 60} min each · pick one of 4 options
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Your name</label>
              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                placeholder="Enter your name"
              />
            </div>
            <Button type="button" className="w-full" onClick={() => setStarted(true)} disabled={!candidateName.trim()} data-testid="async-quiz-start-btn">
              Start quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {submitError && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 text-center">{submitError}</div>
      )}
      {submitting && (
        <div className="bg-blue-50 text-blue-700 text-sm px-4 py-2 text-center flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
        </div>
      )}
      {activeQuiz && (
        <div data-testid="live-quiz-panel" className="flex-1 min-h-0 flex flex-col">
        <LiveQuizPanel
          quiz={activeQuiz}
          participantName={candidateName}
          onAnswer={() => {}}
          onComplete={handleComplete}
        />
        </div>
      )}
    </div>
  );
}
