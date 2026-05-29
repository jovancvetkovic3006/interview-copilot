import { describe, expect, it } from "vitest";
import type { ActiveQuiz, QuizAnswerEntry } from "@/types/quiz";
import { deriveQuizResultsView, quizScoreBadgeVariant } from "./quiz-results-view";

const quiz: ActiveQuiz = {
  quizId: "x",
  templateId: "t",
  title: "Test",
  secondsPerQuestion: 60,
  assignedAt: 1,
  questions: [
    { id: "q1", question: "A?", options: ["a", "b", "c", "d"], correctIndex: 0 },
    { id: "q2", question: "B?", options: ["a", "b", "c", "d"], correctIndex: 1 },
  ],
};

describe("deriveQuizResultsView", () => {
  it("waiting before candidate starts", () => {
    const v = deriveQuizResultsView(quiz, [], { candidateStarted: false });
    expect(v.showWaiting).toBe(true);
    expect(v.correct).toBe(0);
  });

  it("complete with badge tier from percent", () => {
    const answers: QuizAnswerEntry[] = [
      { questionId: "q1", selectedIndex: 0, answeredAt: 1, timeSpentMs: 1 },
      { questionId: "q2", selectedIndex: 0, answeredAt: 2, timeSpentMs: 1 },
    ];
    const v = deriveQuizResultsView(quiz, answers);
    expect(v.showComplete).toBe(true);
    expect(v.percentCorrect).toBe(50);
    expect(v.badgeVariant).toBe("secondary");
  });
});

describe("quizScoreBadgeVariant", () => {
  it("maps score bands for interviewer badge", () => {
    expect(quizScoreBadgeVariant(80)).toBe("default");
    expect(quizScoreBadgeVariant(60)).toBe("secondary");
    expect(quizScoreBadgeVariant(30)).toBe("destructive");
  });
});
