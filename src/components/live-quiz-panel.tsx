"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, CheckCircle2 } from "lucide-react";
import type { ActiveQuiz, QuizAnswerEntry } from "@/types/quiz";

interface LiveQuizPanelProps {
  quiz: ActiveQuiz;
  participantName: string;
  existingAnswers?: QuizAnswerEntry[];
  onAnswer: (answer: QuizAnswerEntry) => void;
  onComplete: (answers: QuizAnswerEntry[]) => void;
  readOnly?: boolean;
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
  readOnly = false,
}: LiveQuizPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(existingAnswers.length, Math.max(0, quiz.questions.length - 1))
  );
  const [answers, setAnswers] = useState<QuizAnswerEntry[]>(existingAnswers);
  const [selected, setSelected] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(quiz.secondsPerQuestion);
  const questionStartedAtRef = useRef(Date.now());
  const completedRef = useRef(false);
  const submitAnswerRef = useRef<(optionIndex: number) => void>(() => {});

  const currentQuestion = quiz.questions[currentIndex];
  const isDone = answers.length >= quiz.questions.length;

  const submitAnswer = useCallback(
    (optionIndex: number) => {
      if (readOnly || !currentQuestion || completedRef.current) return;
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
          setCurrentIndex((i) => i + 1);
        }
        return next;
      });
    },
    [currentIndex, currentQuestion, onAnswer, onComplete, quiz.questions.length, readOnly]
  );

  useEffect(() => {
    submitAnswerRef.current = submitAnswer;
  }, [submitAnswer]);

  useEffect(() => {
    if (readOnly || isDone || !currentQuestion) return;
    questionStartedAtRef.current = Date.now();
    setSecondsLeft(quiz.secondsPerQuestion);
    setSelected(null);
  }, [currentIndex, quiz.secondsPerQuestion, readOnly, isDone, currentQuestion]);

  useEffect(() => {
    if (readOnly || isDone || !currentQuestion) return;
    if (secondsLeft <= 0) {
      submitAnswerRef.current(-1);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, readOnly, isDone, currentQuestion]);

  if (isDone) {
    const correct = answers.filter((a) => {
      const q = quiz.questions.find((qq) => qq.id === a.questionId);
      return q && a.selectedIndex >= 0 && a.selectedIndex === q.correctIndex;
    }).length;
    return (
      <Card className="h-full border-0 shadow-none rounded-none flex flex-col">
        <CardHeader className="text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-2" />
          <CardTitle>Quiz complete</CardTitle>
          <CardDescription>
            {participantName}, you answered all {quiz.questions.length} questions.
            {!readOnly && (
              <span className="block mt-1">
                Score: {correct}/{quiz.questions.length} correct
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <div className="shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{quiz.title}</h2>
          <p className="text-xs text-zinc-500">
            Question {currentIndex + 1} of {quiz.questions.length}
          </p>
        </div>
        <Badge variant={secondsLeft <= 30 ? "destructive" : "secondary"} className="tabular-nums flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTime(secondsLeft)}
        </Badge>
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
              disabled={readOnly}
              onClick={() => {
                setSelected(idx);
                submitAnswer(idx);
              }}
              className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                selected === idx
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-800"
              }`}
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
