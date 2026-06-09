import { describe, expect, it } from "vitest";
import type { ActiveQuiz, QuizAnswerEntry } from "@/types/quiz";
import {
  buildLiveQuizAgentContext,
  formatFailedQuizQuestionsForPrompt,
  formatLiveQuizForPrompt,
  resolveQuizAnswers,
} from "./quiz-summary";

const sampleQuiz: ActiveQuiz = {
  quizId: "live-1",
  templateId: "tpl",
  title: "JS basics",
  secondsPerQuestion: 180,
  assignedAt: 1,
  questions: [
    {
      id: "q1",
      question: "typeof null?",
      options: ["object", "null", "undefined", "number"],
      correctIndex: 0,
    },
    {
      id: "q2",
      question: "Array.isArray([])?",
      options: ["true", "false", "maybe", "error"],
      correctIndex: 0,
    },
  ],
};

describe("resolveQuizAnswers", () => {
  it("prefers final submission over partial in-progress answers", () => {
    const partial: QuizAnswerEntry[] = [
      { questionId: "q1", selectedIndex: 2, answeredAt: 1, timeSpentMs: 1000 },
    ];
    const submission = {
      submittedAt: 2,
      answers: [
        { questionId: "q1", selectedIndex: 0, answeredAt: 2, timeSpentMs: 2000 },
        { questionId: "q2", selectedIndex: 0, answeredAt: 3, timeSpentMs: 1500 },
      ],
    };

    expect(resolveQuizAnswers(partial, submission)).toEqual(submission.answers);
  });
});

describe("buildLiveQuizAgentContext", () => {
  it("reports waiting before candidate starts", () => {
    const ctx = buildLiveQuizAgentContext(sampleQuiz, [], { candidateStarted: false });

    expect(ctx.status).toBe("waiting");
    expect(ctx.answeredCount).toBe(0);
    expect(ctx.percentCorrect).toBe(0);
  });

  it("marks in-progress after first answer", () => {
    const ctx = buildLiveQuizAgentContext(sampleQuiz, [
      { questionId: "q1", selectedIndex: 0, answeredAt: 1, timeSpentMs: 5000 },
    ]);

    expect(ctx.status).toBe("in-progress");
    expect(ctx.answeredCount).toBe(1);
    expect(ctx.correctCount).toBe(1);
    expect(ctx.questions[0].isCorrect).toBe(true);
    expect(ctx.questions[1].skipped).toBe(true);
  });

  it("summarizes completed quiz with wrong answer for agent review", () => {
    const ctx = buildLiveQuizAgentContext(sampleQuiz, [
      { questionId: "q1", selectedIndex: 0, answeredAt: 1, timeSpentMs: 3000 },
      { questionId: "q2", selectedIndex: 1, answeredAt: 2, timeSpentMs: 4000 },
    ]);

    expect(ctx.status).toBe("complete");
    expect(ctx.correctCount).toBe(1);
    expect(ctx.percentCorrect).toBe(50);
    expect(ctx.questions[1].isCorrect).toBe(false);

    const prompt = formatLiveQuizForPrompt(ctx);
    expect(prompt).toContain("Score: 1/2 (50%)");
    expect(prompt).toContain("[wrong]");
    expect(prompt).toContain("Correct: true");
  });

  it("formats only failed quiz questions for review prompt", () => {
    const ctx = buildLiveQuizAgentContext(sampleQuiz, [
      { questionId: "q1", selectedIndex: 0, answeredAt: 1, timeSpentMs: 3000 },
      { questionId: "q2", selectedIndex: 1, answeredAt: 2, timeSpentMs: 4000 },
    ]);
    const failed = formatFailedQuizQuestionsForPrompt(ctx);
    expect(failed).toContain("Q2");
    expect(failed).toContain("[wrong]");
    expect(failed).not.toContain("Q1");
  });
});
