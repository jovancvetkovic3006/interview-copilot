import { describe, expect, it } from "vitest";
import { buildLiveQuizAgentContext } from "./quiz-summary";
import { appendLiveQuizToSystemPrompt, buildQuizReviewPromptHint } from "./chat-quiz-prompt";
import type { ActiveQuiz } from "@/types/quiz";

const quiz: ActiveQuiz = {
  quizId: "q",
  templateId: "t",
  title: "API",
  secondsPerQuestion: 60,
  assignedAt: 1,
  questions: [
    {
      id: "a",
      question: "REST?",
      options: ["yes", "no", "maybe", "idk"],
      correctIndex: 0,
    },
  ],
};

describe("appendLiveQuizToSystemPrompt", () => {
  it("adds history block for all session quizzes", () => {
    const history = [
      buildLiveQuizAgentContext(quiz, [], { candidateStarted: false }),
      buildLiveQuizAgentContext(quiz, [
        { questionId: "a", selectedIndex: 0, answeredAt: 1, timeSpentMs: 1000 },
      ]),
    ];
    const { prompt, includesReviewHints } = appendLiveQuizToSystemPrompt("Hello", {
      liveQuizHistory: history,
    });
    expect(prompt).toContain("ALL LIVE QUIZZES THIS SESSION");
    expect(prompt).toContain("Quiz 1: API (waiting)");
    expect(prompt).toContain("Quiz 2: API (complete)");
    expect(includesReviewHints).toBe(false);
  });

  it("adds active quiz section and interviewer-only review hints", () => {
    const ctx = buildLiveQuizAgentContext(quiz, [
      { questionId: "a", selectedIndex: 1, answeredAt: 1, timeSpentMs: 2000 },
    ]);
    const { prompt, includesReviewHints } = appendLiveQuizToSystemPrompt("", {
      liveQuizContext: ctx,
    });
    expect(prompt).toContain("CURRENTLY SELECTED LIVE QUIZ");
    expect(prompt).toContain("[wrong]");
    expect(includesReviewHints).toBe(true);
    expect(prompt).not.toContain("Do not reveal correct answers to the candidate");
  });
});

describe("buildQuizReviewPromptHint", () => {
  it("focuses on failed items and short follow-up format", () => {
    const ctx = buildLiveQuizAgentContext(quiz, [
      { questionId: "a", selectedIndex: 1, answeredAt: 1, timeSpentMs: 2000 },
    ]);
    const hint = buildQuizReviewPromptHint(ctx);
    expect(hint).toContain("**Failed**");
    expect(hint).toContain("**Ask the candidate**");
    expect(hint).toContain("[wrong]");
    expect(hint).toContain("Do NOT recap the score");
  });
});
