import { describe, expect, it } from "vitest";
import type { QuestionScoreEntry } from "@/types/room";
import {
  findQuestionScoreIndex,
  formatQuestionScoreChatLine,
  scoreLevelShortLabel,
  upsertQuestionScoreEntry,
} from "./question-scoring";

function entry(
  partial: Partial<QuestionScoreEntry> & Pick<QuestionScoreEntry, "question" | "score">
): QuestionScoreEntry {
  return {
    id: partial.id ?? "qs-1",
    question: partial.question,
    score: partial.score,
    scoredAt: partial.scoredAt ?? 1,
    ...partial,
  };
}

describe("question score upsert (re-score without duplicates)", () => {
  it("appends the first rating for a new question", () => {
    const scores = upsertQuestionScoreEntry(
      [],
      entry({ id: "a", questionId: "q1", question: "Explain closures", score: 7 })
    );

    expect(scores).toHaveLength(1);
    expect(scores[0].score).toBe(7);
  });

  it("replaces score for the same preset question id", () => {
    const initial = [
      entry({ id: "stable-id", questionId: "q1", question: "Explain closures", score: 4 }),
    ];
    const updated = upsertQuestionScoreEntry(
      initial,
      entry({ id: "new-id-should-not-win", questionId: "q1", question: "Explain closures", score: 8 })
    );

    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("stable-id");
    expect(updated[0].score).toBe(8);
  });

  it("matches by question text when no preset id was used", () => {
    const initial = [entry({ id: "x", question: "  What is hoisting?  ", score: 5 })];
    const updated = upsertQuestionScoreEntry(
      initial,
      entry({ id: "y", question: "What is hoisting?", score: 9 })
    );

    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("x");
    expect(updated[0].score).toBe(9);
  });

  it("keeps separate scores when two different preset ids share similar wording", () => {
    const scores = upsertQuestionScoreEntry(
      [entry({ id: "1", questionId: "a", question: "Describe REST", score: 6 })],
      entry({ id: "2", questionId: "b", question: "Describe REST", score: 3 })
    );

    expect(scores).toHaveLength(2);
    expect(findQuestionScoreIndex(scores, { questionId: "b", question: "Describe REST" })).toBe(1);
  });
});

describe("formatQuestionScoreChatLine", () => {
  it("formats a line the agent and chat history can parse", () => {
    const line = formatQuestionScoreChatLine({
      question: "Trade-offs of microservices?",
      score: 3,
      category: "architecture",
    });

    expect(line).toContain("[Manual score 3/10");
    expect(line).toContain(scoreLevelShortLabel(3));
    expect(line).toContain("(architecture)");
    expect(line).toContain("Trade-offs of microservices?");
  });
});
