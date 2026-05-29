import { describe, expect, it } from "vitest";
import type { ActiveQuiz, QuizAnswerEntry } from "@/types/quiz";
import { formatQuizBlockForReport, sanitizeCodingTaskHistoryForReport } from "./interview-report-context";

const quiz: ActiveQuiz = {
  quizId: "q1",
  templateId: "t",
  title: "API quiz",
  secondsPerQuestion: 60,
  assignedAt: 1,
  questions: [
    { id: "a", question: "REST?", options: ["yes", "no", "maybe", "idk"], correctIndex: 0 },
    { id: "b", question: "GraphQL?", options: ["yes", "no", "maybe", "idk"], correctIndex: 1 },
  ],
};

describe("interview report: quiz section", () => {
  it("includes score and per-question outcomes after candidate completes quiz", () => {
    const answers: QuizAnswerEntry[] = [
      { questionId: "a", selectedIndex: 0, answeredAt: 1, timeSpentMs: 1000 },
      { questionId: "b", selectedIndex: 0, answeredAt: 2, timeSpentMs: 2000 },
    ];

    const block = formatQuizBlockForReport({
      activeQuiz: quiz,
      quizAnswers: answers,
      quizSubmission: { submittedAt: 3, answers, candidateName: "Sam" },
    });

    expect(block).toContain("Quiz: API quiz (Sam)");
    expect(block).toContain("Score: 1/2");
    expect(block).toContain("incorrect");
  });

  it("returns none when no quiz answers captured", () => {
    expect(formatQuizBlockForReport({ activeQuiz: quiz, quizAnswers: [] })).toBe("(none)");
  });
});

describe("interview report: coding history", () => {
  it("sanitizes tasks opened during the session for the report prompt", () => {
    const rows = sanitizeCodingTaskHistoryForReport([
      { title: "  Two Sum  ", description: "Find pair", language: "typescript", collaborationTaskId: "cid-1" },
      { title: "" },
      null,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Two Sum");
    expect(rows[0].collaborationTaskId).toBe("cid-1");
  });
});
