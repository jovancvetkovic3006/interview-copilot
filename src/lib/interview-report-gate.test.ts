import { describe, expect, it } from "vitest";
import { hasUsableTranscript } from "./interview-report-gate";

describe("hasUsableTranscript", () => {
  it("blocks report generation when nothing was captured", () => {
    expect(hasUsableTranscript([])).toBe(false);
    expect(hasUsableTranscript(undefined)).toBe(false);
  });

  it("ignores whitespace-only STT lines", () => {
    expect(hasUsableTranscript([{ text: "   " }, { text: "\n" }])).toBe(false);
  });

  it("allows report when at least one line has real speech content", () => {
    expect(
      hasUsableTranscript([
        { text: "   " },
        { text: "Candidate explained the design clearly." },
      ])
    ).toBe(true);
  });
});
