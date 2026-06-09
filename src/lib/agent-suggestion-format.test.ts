import { describe, expect, it } from "vitest";
import {
  buildQuestionScoreFollowUpPromptHint,
  compactAgentSuggestionReply,
  compactNextQuestionsReply,
} from "./agent-suggestion-format";

describe("compactAgentSuggestionReply", () => {
  it("keeps only Next best question and Scoring hint sections", () => {
    const raw = `Here is some preamble you should drop.

**Next best question**
How would you handle cache invalidation across pods?

**Scoring hint**
Strong answers mention TTL plus event-driven eviction; weak ones only say "restart the service."

**Follow-ups**
- Tell me about Redis
- What about Kafka?`;

    const out = compactAgentSuggestionReply(raw);
    expect(out).toContain("**Next best question**");
    expect(out).toContain("cache invalidation");
    expect(out).toContain("**Scoring hint**");
    expect(out).toContain("Strong answers");
    expect(out).not.toContain("Follow-ups");
    expect(out).not.toContain("preamble");
  });

  it("falls back to first block when headings are missing", () => {
    expect(compactAgentSuggestionReply("Short generic reply.")).toBe("Short generic reply.");
  });
});

describe("buildQuestionScoreFollowUpPromptHint", () => {
  it("anchors follow-ups to the scored question", () => {
    const hint = buildQuestionScoreFollowUpPromptHint({
      question: "Explain Redis cache invalidation.",
      score: 7,
      category: "backend",
    });
    expect(hint).toContain("ANCHOR QUESTION");
    expect(hint).toContain("Explain Redis cache invalidation.");
    expect(hint).toContain("same topic");
    expect(hint).toContain("Ignore live transcript");
  });
});

describe("compactNextQuestionsReply", () => {
  it("keeps up to three numbered next questions only", () => {
    const raw = `Good score. Consider probing deeper.

**Next questions**
1. How would you size the connection pool?
2. What happens under load?
3. How do you handle retries?
4. Extra question to drop

**Scoring hint**
Should not appear.`;

    const out = compactNextQuestionsReply(raw);
    expect(out).toBe(
      "**Next questions**\n1. How would you size the connection pool?\n2. What happens under load?\n3. How do you handle retries?"
    );
    expect(out).not.toContain("Scoring hint");
    expect(out).not.toContain("Extra question");
  });
});
