import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyClockState } from "@/lib/party-room-logic";
import {
  applyInterviewTimerUpdate,
  buildInterviewTimeBroadcastPayload,
  deriveInterviewTimerDisplay,
  emptyInterviewTimerState,
} from "./interview-timer";

const T0 = new Date("2026-05-28T14:00:00.000Z").getTime();
const CONFIG_30 = { duration: 30 };

function candidateDisplay(
  timer: ReturnType<typeof applyInterviewTimerUpdate>,
  clockNow: number
) {
  return deriveInterviewTimerDisplay({
    phase: "interview",
    clockNow,
    interviewStartedAt: timer.interviewStartedAt,
    interviewEndsAt: timer.interviewEndsAt,
    timeExtensionMinutes: timer.timeExtensionMinutes,
    interviewDurationMinutes: 30,
    lastTimeExtension: timer.lastTimeExtension,
  });
}

describe("buildInterviewTimeBroadcastPayload + applyInterviewTimerUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("candidate sees Time's up when overdue and extension was never applied", () => {
    const overdue = T0 + 45 * 60_000;
    vi.setSystemTime(overdue);

    const candidate = emptyInterviewTimerState();
    candidate.interviewStartedAt = T0;

    const display = candidateDisplay(candidate, overdue);

    expect(display.scheduleExpired).toBe(true);
    expect(display.timeWasExtended).toBe(false);
    expect(display.showCandidateExtensionBanner).toBe(false);
    expect(display.plannedTotalMinutes).toBe(30);
  });

  it("after host adds 30 min when overdue, candidate clears Time's up and shows extension", () => {
    const overdue = T0 + 45 * 60_000;
    vi.setSystemTime(overdue);

    const server: PartyClockState = {
      phase: "interview",
      interviewStartedAt: T0,
      timeExtensionMinutes: 0,
      config: CONFIG_30,
    };

    const broadcast = buildInterviewTimeBroadcastPayload(server, 30, overdue);
    expect(broadcast).not.toBeNull();
    expect(broadcast!.interviewEndsAt).toBeDefined();
    expect(broadcast!.minutesAdded).toBe(30);

    let candidate = emptyInterviewTimerState();
    candidate.interviewStartedAt = T0;

    const before = candidateDisplay(candidate, overdue);
    expect(before.scheduleExpired).toBe(true);

    candidate = applyInterviewTimerUpdate(candidate, broadcast!, CONFIG_30, overdue);
    const after = candidateDisplay(candidate, overdue);

    expect(after.scheduleExpired).toBe(false);
    expect(after.timeWasExtended).toBe(true);
    expect(after.showCandidateExtensionBanner).toBe(true);
    expect(after.showHostWaitingForTimeBanner).toBe(false);
    expect(after.remainingMs).toBeGreaterThanOrEqual(29 * 60_000);
    expect(after.plannedTotalMinutes).toBeGreaterThan(30);
  });

  it("authoritative interviewEndsAt fixes candidate even if extension minutes were stale", () => {
    const now = T0 + 50 * 60_000;
    vi.setSystemTime(now);

    const endsAt = now + 30 * 60_000;
    const candidate = applyInterviewTimerUpdate(
      { ...emptyInterviewTimerState(), interviewStartedAt: T0, timeExtensionMinutes: 0 },
      {
        interviewEndsAt: endsAt,
        timeExtensionMinutes: 50,
        minutesAdded: 30,
      },
      CONFIG_30,
      now
    );

    const display = candidateDisplay(candidate, now);

    expect(display.deadlineMs).toBe(endsAt);
    expect(display.scheduleExpired).toBe(false);
    expect(display.remainingMs).toBeCloseTo(30 * 60_000, -3);
  });

  it("candidate without room config still counts down when server sends interviewEndsAt", () => {
    const now = T0 + 40 * 60_000;
    const endsAt = now + 25 * 60_000;

    const candidate = applyInterviewTimerUpdate(
      { ...emptyInterviewTimerState(), interviewStartedAt: T0 },
      { interviewEndsAt: endsAt, timeExtensionMinutes: 35, minutesAdded: 30 },
      null,
      now
    );

    const display = deriveInterviewTimerDisplay({
      phase: "interview",
      clockNow: now,
      interviewStartedAt: candidate.interviewStartedAt,
      interviewEndsAt: candidate.interviewEndsAt,
      timeExtensionMinutes: candidate.timeExtensionMinutes,
      interviewDurationMinutes: 30,
      lastTimeExtension: candidate.lastTimeExtension,
    });

    expect(display.deadlineMs).toBe(endsAt);
    expect(display.scheduleExpired).toBe(false);
  });
});

describe("deriveInterviewTimerDisplay", () => {
  it("does not show extension banner when time is up with no extension event", () => {
    const display = deriveInterviewTimerDisplay({
      phase: "interview",
      clockNow: T0 + 60 * 60_000,
      interviewStartedAt: T0,
      interviewEndsAt: T0 + 30 * 60_000,
      timeExtensionMinutes: 0,
      interviewDurationMinutes: 30,
      lastTimeExtension: null,
    });

    expect(display.scheduleExpired).toBe(true);
    expect(display.showCandidateExtensionBanner).toBe(false);
  });

  it("host waiting banner only when expired and not extended", () => {
    const expired = deriveInterviewTimerDisplay({
      phase: "interview",
      clockNow: T0 + 31 * 60_000,
      interviewStartedAt: T0,
      interviewEndsAt: T0 + 30 * 60_000,
      timeExtensionMinutes: 0,
      interviewDurationMinutes: 30,
      lastTimeExtension: null,
    });
    expect(expired.showHostWaitingForTimeBanner).toBe(true);

    const extended = deriveInterviewTimerDisplay({
      phase: "interview",
      clockNow: T0 + 31 * 60_000,
      interviewStartedAt: T0,
      interviewEndsAt: T0 + 61 * 60_000,
      timeExtensionMinutes: 31,
      interviewDurationMinutes: 30,
      lastTimeExtension: { at: T0 + 31 * 60_000, minutes: 30 },
    });
    expect(extended.showHostWaitingForTimeBanner).toBe(false);
    expect(extended.showCandidateExtensionBanner).toBe(true);
  });
});
