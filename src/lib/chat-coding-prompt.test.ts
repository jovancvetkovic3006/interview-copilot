import { describe, expect, it } from "vitest";
import {
  appendCodingReviewToSystemPrompt,
  codingReviewBehaviorHint,
} from "./chat-coding-prompt";

const submission = {
  title: "Two Sum",
  description: "Return indices of two numbers that add to target.",
  language: "typescript",
  code: "function twoSum(nums: number[], target: number) {\n  return [0, 1];\n}",
};

describe("coding review agent flow", () => {
  it("includes candidate code when interviewer requests review", () => {
    const { prompt, includesReviewHints } = appendCodingReviewToSystemPrompt("BASE", {
      ...submission,
      requestedBy: "interviewer",
    });

    expect(prompt).toContain("IN-ROOM CODING TASK");
    expect(prompt).toContain("twoSum");
    expect(prompt).toContain("interviewer shared");
    expect(includesReviewHints).toBe(true);
  });

  it("uses candidate-request wording when they ask for feedback", () => {
    const { prompt } = appendCodingReviewToSystemPrompt("", {
      ...submission,
      requestedBy: "candidate",
    });

    expect(prompt).toContain("candidate asked you to review");
  });

  it("exposes behavior hint for system prompt footer", () => {
    const hint = codingReviewBehaviorHint({ ...submission, requestedBy: "interviewer" });
    expect(hint).toContain("evaluate the candidate");
    expect(hint).toContain("Do not assign a new [CODING_TASK]");
  });
});
