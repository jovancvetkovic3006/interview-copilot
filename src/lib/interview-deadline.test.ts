import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interviewDurationMinutes, nextTimeExtensionMinutes } from "./interview-deadline";

const T0 = new Date("2026-05-28T14:00:00.000Z").getTime();

function remainingMinutesAfterExtension(
  startedAt: number,
  durationMinutes: number,
  extensionMinutes: number,
  now: number
): number {
  const deadline = startedAt + durationMinutes * 60_000 + extensionMinutes * 60_000;
  return Math.max(0, Math.round((deadline - now) / 60_000));
}

describe("interviewDurationMinutes", () => {
  it("uses configured duration when host set a valid block length", () => {
    expect(interviewDurationMinutes({ duration: 45 })).toBe(45);
  });

  it("falls back to 30 minutes when config is missing or invalid", () => {
    expect(interviewDurationMinutes(null)).toBe(30);
    expect(interviewDurationMinutes({ duration: 0 })).toBe(30);
    expect(interviewDurationMinutes({ duration: -5 })).toBe(30);
  });
});

describe("nextTimeExtensionMinutes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds flat minutes when interview clock was never started", () => {
    expect(nextTimeExtensionMinutes(null, 30, 0, 30)).toBe(30);
    expect(nextTimeExtensionMinutes(null, 30, 15, 60)).toBe(75);
  });

  it("extends the planned block when time is still remaining", () => {
    const startedAt = T0;
    const duration = 30;
    vi.setSystemTime(T0 + 10 * 60_000);

    const extension = nextTimeExtensionMinutes(startedAt, duration, 0, 30);

    expect(extension).toBe(30);
    expect(remainingMinutesAfterExtension(startedAt, duration, extension, Date.now())).toBe(50);
  });

  it("grants time from now when the block is already overdue (host modal bug)", () => {
    const startedAt = T0;
    const duration = 30;
    vi.setSystemTime(T0 + 60 * 60_000);

    const extension = nextTimeExtensionMinutes(startedAt, duration, 0, 30);

    expect(remainingMinutesAfterExtension(startedAt, duration, extension, Date.now())).toBe(30);
    expect(extension).toBeGreaterThan(30);
  });

  it("never shrinks extension when host adds time again", () => {
    const startedAt = T0;
    vi.setSystemTime(T0 + 45 * 60_000);

    const afterFirst = nextTimeExtensionMinutes(startedAt, 30, 0, 30);
    const afterSecond = nextTimeExtensionMinutes(startedAt, 30, afterFirst, 30);

    expect(afterSecond).toBeGreaterThanOrEqual(afterFirst);
  });

  it("adds a full hour when host picks the 60-minute option", () => {
    const startedAt = T0;
    vi.setSystemTime(T0 + 5 * 60_000);

    const extension = nextTimeExtensionMinutes(startedAt, 30, 0, 60);

    expect(remainingMinutesAfterExtension(startedAt, 30, extension, Date.now())).toBe(85);
  });
});
