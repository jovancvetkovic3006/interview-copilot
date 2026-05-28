import { describe, expect, it } from "vitest";
import { formatManualQuestionScoresPromptSection } from "./chat-prompt-sections";

describe("formatManualQuestionScoresPromptSection", () => {
  it("returns empty string when no scores exist", () => {
    expect(formatManualQuestionScoresPromptSection([])).toBe("");
  });

  it("includes scores and coaching hints for the assistant", () => {
    const section = formatManualQuestionScoresPromptSection([
      {
        question: "What is hoisting?",
        score: 3,
        scoreLabel: "Weak",
        category: "javascript",
        scoredAt: 1_700_000_000_000,
      },
    ]);

    expect(section).toContain("MANUAL QUESTION SCORES");
    expect(section).toContain("[3/10 Weak]");
    expect(section).toContain("[javascript]");
    expect(section).toContain("What is hoisting?");
    expect(section).toContain("probe weak scores");
  });
});
