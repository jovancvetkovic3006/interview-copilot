import { describe, expect, it } from "vitest";
import { hasUsableTranscript, sessionNotesMeetMinimum } from "./interview-report-gate";

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

describe("sessionNotesMeetMinimum", () => {
  it("matches review UI hint for optional final notes quality", () => {
    expect(sessionNotesMeetMinimum("short")).toBe(false);
    expect(
      sessionNotesMeetMinimum(
        "Candidate showed strong system design instincts and clear communication."
      )
    ).toBe(true);
  });
});
