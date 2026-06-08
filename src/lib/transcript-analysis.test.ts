import { describe, expect, it } from "vitest";
import {
  buildTranscriptAnalysisWindow,
  normalizeTranscriptAnalysisResponse,
  shouldScheduleTranscriptAnalysis,
  transcriptWindowReadyForApi,
  TRANSCRIPT_ANALYSIS_GATE_CHARS,
} from "./transcript-analysis";

describe("transcript analysis scheduling (host background flow)", () => {
  const transcript = [
    { speaker: "Alex", text: "I would use a hash map for O(1) lookups." },
    { speaker: "Host", text: "What about memory?" },
    { speaker: "Alex", text: "Trade-off is higher footprint but predictable latency." },
  ];

  it("does not schedule when nothing new since last analysis", () => {
    expect(shouldScheduleTranscriptAnalysis(transcript, transcript.length)).toBe(false);
  });

  it("schedules when enough new spoken content arrives", () => {
    expect(shouldScheduleTranscriptAnalysis(transcript, 0)).toBe(true);
  });

  it("requires minimum window length before API call", () => {
    const short = [{ speaker: "A", text: "ok" }];
    const { windowText } = buildTranscriptAnalysisWindow(short, 0);
    expect(windowText.length).toBeLessThan(TRANSCRIPT_ANALYSIS_GATE_CHARS);
    expect(transcriptWindowReadyForApi(windowText)).toBe(false);
  });
});

describe("normalizeTranscriptAnalysisResponse", () => {
  it("parses strong answer with follow-ups for agent broadcast", () => {
    const entry = normalizeTranscriptAnalysisResponse(
      {
        summary: "Clear explanation of hash map trade-offs.",
        score: 8,
        answerQuality: "strong",
        followUpQuestions: ["How would you size the map?", "What if keys collide?"],
      },
      { id: "ta-1", timestamp: 100, transcriptEndLength: 5 }
    );

    expect(entry?.answerQuality).toBe("strong");
    expect(entry?.score).toBe(8);
    expect(entry?.followUpQuestions).toHaveLength(1);
    expect(entry?.followUpQuestions?.[0]).toBe("How would you size the map?");
  });

  it("strips follow-ups for n/a windows", () => {
    const entry = normalizeTranscriptAnalysisResponse(
      {
        summary: "Mostly interviewer small talk.",
        score: 0,
        answerQuality: "n/a",
        followUpQuestions: ["Generic question"],
      },
      { id: "ta-2", timestamp: 101, transcriptEndLength: 3 }
    );

    expect(entry?.followUpQuestions).toEqual([]);
  });

  it("rejects empty summaries", () => {
    expect(
      normalizeTranscriptAnalysisResponse(
        { summary: "  ", score: 5, answerQuality: "adequate" },
        { id: "x", timestamp: 1, transcriptEndLength: 1 }
      )
    ).toBeNull();
  });
});
