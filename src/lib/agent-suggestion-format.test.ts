import { describe, expect, it } from "vitest";
import { compactAgentSuggestionReply } from "./agent-suggestion-format";

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
