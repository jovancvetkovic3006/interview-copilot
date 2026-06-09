import { describe, expect, it } from "vitest";
import {
  buildSpokenSectionForReport,
  formatQuestionScoresForReport,
  shouldSummarizeTranscriptBeforeReport,
} from "./interview-report-spoken";

describe("shouldSummarizeTranscriptBeforeReport", () => {
  it("skips summarization when client already provided a summary", () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({
      speaker: "A",
      text: `line ${i}`,
    }));
    expect(shouldSummarizeTranscriptBeforeReport(lines, "Existing summary")).toBe(false);
  });

  it("requests summarization for long transcripts without a summary", () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      speaker: "A",
      text: `substantive answer ${i}`,
    }));
    expect(shouldSummarizeTranscriptBeforeReport(lines)).toBe(true);
  });
});

describe("buildSpokenSectionForReport", () => {
  it("returns none when no transcript exists", () => {
    const section = buildSpokenSectionForReport({ transcriptLines: [] });
    expect(section).toBe("(none)");
  });

  it("includes summary and tail for long interviews", () => {
    const lines = Array.from({ length: 35 }, (_, i) => ({
      speaker: "Candidate",
      text: `Answer fragment ${i} with enough content`,
    }));
    const section = buildSpokenSectionForReport({
      transcriptLines: lines,
      transcriptSummaryText: "## Summary\nCandidate did well.",
      summaryThreshold: 30,
      rawTailLines: 10,
    });
    expect(section).toContain("Structured summary");
    expect(section).toContain("Candidate did well");
    expect(section).toContain("Raw transcript tail");
  });

  it("falls back to raw tail when summarization fails", () => {
    const lines = [
      { speaker: "Host", text: "Tell me about React." },
      { speaker: "Candidate", text: "React is a UI library." },
    ];
    const section = buildSpokenSectionForReport({
      transcriptLines: lines,
      transcriptSummaryError: "API timeout",
    });
    expect(section).not.toContain("summarization unavailable");
    expect(section).toContain("React is a UI library");
  });
});

describe("formatQuestionScoresForReport", () => {
  it("formats manual scores for the report prompt", () => {
    const block = formatQuestionScoresForReport([
      { question: "System design?", category: "architecture", score: 6, notes: "shallow" },
    ]);
    expect(block).toContain("[architecture]");
    expect(block).toContain("6/10");
    expect(block).toContain("interviewer note: shallow");
  });
});
