"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, CheckCircle2, ClipboardList, Play } from "lucide-react";
import type { ActiveQuiz, QuizAnswerEntry } from "@/types/quiz";

interface LiveQuizPanelProps {
  quiz: ActiveQuiz;
  participantName: string;
  existingAnswers?: QuizAnswerEntry[];
  onAnswer: (answer: QuizAnswerEntry) => void;
  onComplete: (answers: QuizAnswerEntry[]) => void;
  /** Called when the candidate clicks Start (before the first question timer runs). */
  onStart?: () => void;
  readOnly?: boolean;
  /** If true, hide the score on the candidate completion screen. */
  hideScoreOnComplete?: boolean;
  /** Interviewer mirror: candidate has clicked Start. */
  forceStarted?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LiveQuizPanel({
  quiz,
  participantName,
  existingAnswers = [],
  onAnswer,
  onComplete,
  onStart,
  readOnly = false,
  hideScoreOnComplete = false,
  forceStarted = false,
}: LiveQuizPanelProps) {
  const [hasStarted, setHasStarted] = useState(() => existingAnswers.length > 0 || forceStarted);
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(existingAnswers.length, Math.max(0, quiz.questions.length - 1))
  );
  const [answers, setAnswers] = useState<QuizAnswerEntry[]>(existingAnswers);
  const [selected, setSelected] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(quiz.secondsPerQuestion);
  const questionStartedAtRef = useRef(Date.now());
  const completedRef = useRef(false);
  const submitAnswerRef = useRef<(optionIndex: number) => void>(() => {});

  // New quiz assignment — reset local UI unless we're resuming mid-quiz.
  useEffect(() => {
    completedRef.current = false;
    setAnswers(existingAnswers);
    const resumed = existingAnswers.length > 0 || forceStarted;
    setHasStarted(resumed);
    setCurrentIndex(Math.min(existingAnswers.length, Math.max(0, quiz.questions.length - 1)));
    setSelected(null);
    setSecondsLeft(quiz.secondsPerQuestion);
  }, [quiz.quizId, forceStarted]);

  useEffect(() => {
    if (existingAnswers.length > answers.length) {
      setAnswers(existingAnswers);
      if (existingAnswers.length > 0) setHasStarted(true);
      setCurrentIndex(
        Math.min(existingAnswers.length, Math.max(0, quiz.questions.length - 1))
      );
    }
  }, [existingAnswers, answers.length, quiz.questions.length]);

  const isDone = answers.length >= quiz.questions.length;
  const questionIndex = Math.min(
    Math.max(0, currentIndex),
    Math.max(0, quiz.questions.length - 1)
  );
  const currentQuestion = quiz.questions[questionIndex];

  const submitAnswer = useCallback(
    (optionIndex: number) => {
      if (readOnly || !currentQuestion || completedRef.current || !hasStarted) return;
      const entry: QuizAnswerEntry = {
        questionId: currentQuestion.id,
        selectedIndex: optionIndex,
        answeredAt: Date.now(),
        timeSpentMs: Date.now() - questionStartedAtRef.current,
      };
      setAnswers((prev) => {
        const next = [...prev.filter((a) => a.questionId !== currentQuestion.id), entry];
        onAnswer(entry);
        if (currentIndex + 1 >= quiz.questions.length) {
          completedRef.current = true;
          onComplete(next);
        } else {
          setCurrentIndex((i) => Math.min(i + 1, quiz.questions.length - 1));
        }
        return next;
      });
    },
    [currentIndex, currentQuestion, hasStarted, onAnswer, onComplete, quiz.questions.length, readOnly]
  );

  useEffect(() => {
    submitAnswerRef.current = submitAnswer;
  }, [submitAnswer]);

  useEffect(() => {
    if (readOnly || isDone || !currentQuestion || !hasStarted) return;
    questionStartedAtRef.current = Date.now();
    setSecondsLeft(quiz.secondsPerQuestion);
    setSelected(null);
  }, [currentIndex, quiz.secondsPerQuestion, readOnly, isDone, currentQuestion, hasStarted]);

  useEffect(() => {
    if (readOnly || isDone || !currentQuestion || !hasStarted) return;
    if (secondsLeft <= 0) {
      submitAnswerRef.current(-1);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, readOnly, isDone, currentQuestion, hasStarted]);

  const handleStart = () => {
    setHasStarted(true);
    questionStartedAtRef.current = Date.now();
    setSecondsLeft(quiz.secondsPerQuestion);
    onStart?.();
  };

  if (isDone) {
    const correct = answers.filter((a) => {
      const q = quiz.questions.find((qq) => qq.id === a.questionId);
      return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
    }).length;
    return (
      <Card className="h-full border-0 shadow-none rounded-none flex flex-col" data-testid="quiz-complete">
        <CardHeader className="text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-2" />
          <CardTitle>Quiz complete</CardTitle>
          <CardDescription>
            {participantName}, you answered all {quiz.questions.length} questions.
            {!hideScoreOnComplete && !readOnly && (
              <span className="block mt-1">
                Score: {correct}/{quiz.questions.length} correct
              </span>
            )}
            {readOnly && (
              <span className="block mt-1 text-zinc-500">The interviewer can see your results.</span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasStarted && !readOnly) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-zinc-950">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <ClipboardList className="h-10 w-10 mx-auto text-indigo-600 mb-2" />
            <CardTitle>{quiz.title}</CardTitle>
            <CardDescription>
              {quiz.questions.length} multiple-choice questions · {quiz.secondsPerQuestion / 60} minutes per question
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Take a moment to get ready. The timer starts only after you press Start — each question has its own{" "}
              {quiz.secondsPerQuestion / 60}-minute limit.
            </p>
            <Button type="button" className="w-full" size="lg" onClick={handleStart} data-testid="quiz-start-btn">
              <Play className="h-4 w-4 mr-2" />
              Start quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (readOnly && !hasStarted) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-zinc-500">
        Waiting for the candidate to start the quiz…
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-zinc-500" data-testid="quiz-panel-empty">
        Loading quiz…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950" data-testid="quiz-question-step">
      <div className="shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{quiz.title}</h2>
          <p className="text-xs text-zinc-500">
            Question {questionIndex + 1} of {quiz.questions.length}
          </p>
        </div>
        {!readOnly && (
          <Badge variant={secondsLeft <= 30 ? "destructive" : "secondary"} className="tabular-nums flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(secondsLeft)}
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-6 leading-relaxed">
          {currentQuestion.question}
        </p>
        <div className="space-y-2 max-w-2xl">
          {currentQuestion.options.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              data-testid={`quiz-option-${idx}`}
              disabled={readOnly}
              onClick={() => {
                if (readOnly) return;
                setSelected(idx);
                submitAnswer(idx);
              }}
              className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                selected === idx
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-800"
              } ${readOnly ? "cursor-default opacity-90" : ""}`}
            >
              <span className="font-medium text-zinc-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {!readOnly && (
        <div className="shrink-0 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] text-zinc-400 text-center">
            {quiz.secondsPerQuestion / 60} minutes per question — tap an option to answer, or wait for auto-advance
          </p>
        </div>
      )}
    </div>
  );
}
