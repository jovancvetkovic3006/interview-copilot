import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInterviewTimeBroadcastPayload } from "./interview-timer";
import {
  applyServerPhaseTransition,
  applyServerQuestionScore,
  applyServerTimeExtension,
  applyServerTranscript,
  applyServerTranscriptAnalysis,
  ensureCollaborationTaskId,
} from "./party-room-logic";
import type { QuestionScoreEntry, TranscriptAnalysisEntry } from "@/types/room";

const T0 = new Date("2026-05-28T14:00:00.000Z").getTime();

describe("applyServerPhaseTransition", () => {
  it("starts the interview clock on first transition to interview", () => {
    const next = applyServerPhaseTransition(
      { phase: "setup", interviewStartedAt: null, timeExtensionMinutes: 0, config: { duration: 30 } },
      "interview",
      T0
    );
    expect(next.phase).toBe("interview");
    expect(next.interviewStartedAt).toBe(T0);
  });

  it("does not reset interviewStartedAt on later phase messages", () => {
    const next = applyServerPhaseTransition(
      {
        phase: "interview",
        interviewStartedAt: T0,
        timeExtensionMinutes: 0,
        config: { duration: 30 },
      },
      "interview",
      T0 + 60_000
    );
    expect(next.interviewStartedAt).toBe(T0);
  });
});

describe("applyServerTimeExtension", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores extension outside interview phase", () => {
    expect(
      applyServerTimeExtension(
        { phase: "setup", interviewStartedAt: null, timeExtensionMinutes: 0, config: null },
        30,
        Date.now()
      )
    ).toBeNull();
  });

  it("extends from now when interview is overdue", () => {
    vi.setSystemTime(T0 + 60 * 60_000);
    const server = {
      phase: "interview" as const,
      interviewStartedAt: T0,
      timeExtensionMinutes: 0,
      config: { duration: 30 },
    };
    const result = applyServerTimeExtension(server, 30, Date.now());
    expect(result).not.toBeNull();
    expect(result!.timeExtensionMinutes).toBeGreaterThan(30);

    const broadcast = buildInterviewTimeBroadcastPayload(server, 30, Date.now());
    expect(broadcast?.interviewEndsAt).toBeDefined();
    expect(broadcast?.minutesAdded).toBe(30);
  });
});

describe("applyServerQuestionScore", () => {
  it("upserts scores on the server room state", () => {
    const first: QuestionScoreEntry = {
      id: "qs-1",
      questionId: "q1",
      question: "Explain closures",
      score: 4,
      scoredAt: 1,
    };
    const scores = applyServerQuestionScore([], first);
    const updated = applyServerQuestionScore(scores, {
      ...first,
      id: "qs-2",
      score: 8,
    });
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("qs-1");
    expect(updated[0].score).toBe(8);
  });
});

describe("applyServerTranscript", () => {
  it("appends STT lines to shared room transcript", () => {
    const next = applyServerTranscript([], {
      text: "I use BFS for shortest path.",
      speaker: "Candidate",
      timestamp: 1,
    });
    expect(next).toHaveLength(1);
    expect(next[0].text).toContain("BFS");
  });
});

describe("applyServerTranscriptAnalysis", () => {
  it("appends host analysis for other interviewers to receive", () => {
    const analysis: TranscriptAnalysisEntry = {
      id: "ta-1",
      timestamp: 2,
      transcriptEndLength: 4,
      summary: "Good depth on graphs.",
      score: 7,
      answerQuality: "adequate",
    };
    const next = applyServerTranscriptAnalysis([], analysis);
    expect(next[0].summary).toContain("graphs");
  });
});

describe("ensureCollaborationTaskId", () => {
  it("assigns stable id so all clients join the same Yjs doc", () => {
    const task = ensureCollaborationTaskId(
      { title: "LRU Cache", description: "Design cache", language: "typescript" },
      "collab-abc"
    ) as { collaborationTaskId: string; title: string };

    expect(task.collaborationTaskId).toBe("collab-abc");
    expect(task.title).toBe("LRU Cache");
  });
});
