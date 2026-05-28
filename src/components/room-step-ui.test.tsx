import { describe, expect, it } from "vitest";
import { resolveActiveStep, sessionIsLive } from "@/lib/room-step";

/**
 * Regression tests for the room UI step machine (extracted from RoomPageClient).
 * These document the candidate "stuck on waiting" and post–time-extension bugs.
 */
describe("RoomPageClient step resolution", () => {
  it("candidate stays on interview after host adds time (phase flicker + live session)", () => {
    const live = sessionIsLive({
      phase: "setup",
      interviewStartedAt: 1_700_000_000_000,
      hasConfig: true,
      hasCodingTask: true,
      hasActiveQuiz: false,
      codingTaskHistoryCount: 1,
      quizHistoryCount: 0,
    });
    expect(live).toBe(true);
    expect(resolveActiveStep("setup", "interview", live)).toBe("interview");
  });

  it("candidate on waiting screen only before any live signals", () => {
    const live = sessionIsLive({
      phase: "setup",
      interviewStartedAt: null,
      hasConfig: false,
      hasCodingTask: false,
      hasActiveQuiz: false,
      codingTaskHistoryCount: 0,
      quizHistoryCount: 0,
    });
    expect(resolveActiveStep("setup", "setup", live)).toBe("setup");
  });
});
