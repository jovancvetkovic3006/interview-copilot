import { describe, expect, it } from "vitest";
import {
  applyInterviewTimerUpdate,
  buildInterviewTimeBroadcastPayload,
  deriveInterviewTimerDisplay,
  emptyInterviewTimerState,
} from "@/lib/interview-timer";
import { resolveActiveStep, sessionIsLive } from "@/lib/room-step";

const T0 = 1_700_000_000_000;

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

describe("candidate timer UI after host extends time", () => {
  it("regression: must not show Time's up once interview-time broadcast is applied", () => {
    const overdue = T0 + 40 * 60_000;
    const server = {
      phase: "interview" as const,
      interviewStartedAt: T0,
      timeExtensionMinutes: 0,
      config: { duration: 30 },
    };
    const broadcast = buildInterviewTimeBroadcastPayload(server, 30, overdue)!;

    let timer = { ...emptyInterviewTimerState(), interviewStartedAt: T0 };
    const before = deriveInterviewTimerDisplay({
      phase: "interview",
      clockNow: overdue,
      interviewStartedAt: timer.interviewStartedAt,
      interviewEndsAt: timer.interviewEndsAt,
      timeExtensionMinutes: timer.timeExtensionMinutes,
      interviewDurationMinutes: 30,
      lastTimeExtension: timer.lastTimeExtension,
    });
    expect(before.scheduleExpired).toBe(true);

    timer = applyInterviewTimerUpdate(timer, broadcast, { duration: 30 }, overdue);
    const after = deriveInterviewTimerDisplay({
      phase: "interview",
      clockNow: overdue,
      interviewStartedAt: timer.interviewStartedAt,
      interviewEndsAt: timer.interviewEndsAt,
      timeExtensionMinutes: timer.timeExtensionMinutes,
      interviewDurationMinutes: 30,
      lastTimeExtension: timer.lastTimeExtension,
    });

    expect(after.scheduleExpired).toBe(false);
    expect(after.showCandidateExtensionBanner).toBe(true);
    expect(after.plannedTotalMinutes).toBeGreaterThan(30);
  });
});
