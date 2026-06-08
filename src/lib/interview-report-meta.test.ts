import { describe, expect, it } from "vitest";
import {
  buildInterviewReportMeta,
  normalizeRoomCode,
  reportMarkdownPath,
} from "./interview-report-meta";

describe("interview-report-meta", () => {
  it("normalizes room codes", () => {
    expect(normalizeRoomCode(" abc12 ")).toBe("ABC12");
  });

  it("builds metadata from config and participants", () => {
    const meta = buildInterviewReportMeta({
      roomCode: "xyz789",
      config: {
        candidateName: "Ana",
        role: "Backend Developer",
        difficulty: "senior",
      },
      participants: [{ name: "Host", role: "interviewer" }],
      generatedAt: 1_700_000_000_000,
    });
    expect(meta).toEqual({
      roomCode: "XYZ789",
      candidateName: "Ana",
      role: "Backend Developer",
      difficulty: "senior",
      generatedAt: 1_700_000_000_000,
      hostName: "Host",
    });
    expect(reportMarkdownPath("xyz789")).toBe("interview-reports/XYZ789/report.md");
  });
});
