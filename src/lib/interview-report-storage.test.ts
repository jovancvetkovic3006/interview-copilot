import { afterEach, describe, expect, it } from "vitest";
import { loadInterviewReport, saveInterviewReport } from "./interview-report-storage";

describe("interview-report-storage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips report by room code", () => {
    const report = { markdown: "## Summary\n\nGood candidate.", generatedAt: 1_700_000_000_000 };
    saveInterviewReport("abc123", report);
    expect(loadInterviewReport("abc123")).toEqual(report);
    expect(loadInterviewReport("ABC123")).toEqual(report);
  });

  it("returns null when missing", () => {
    expect(loadInterviewReport("missing")).toBeNull();
  });
});
