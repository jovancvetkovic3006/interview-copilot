import {
  interviewDeadlineMs,
  interviewDurationMinutes,
  nextTimeExtensionMinutes,
} from "@/lib/interview-deadline";
import type { PartyClockState } from "@/lib/party-room-logic";

/** Wire payload for `interview-time` / phase timer fields (server → all clients). */
export type InterviewTimerPayload = {
  interviewStartedAt?: number | null;
  timeExtensionMinutes?: number;
  interviewEndsAt?: number;
  minutesAdded?: 30 | 60;
};

export type InterviewTimerClientState = {
  interviewStartedAt: number | null;
  timeExtensionMinutes: number;
  interviewEndsAt: number | null;
  lastTimeExtension: { at: number; minutes: 30 | 60 } | null;
};

export const emptyInterviewTimerState = (): InterviewTimerClientState => ({
  interviewStartedAt: null,
  timeExtensionMinutes: 0,
  interviewEndsAt: null,
  lastTimeExtension: null,
});

/** Applies a server timer broadcast onto local client state (used by usePartyRoom). */
export function applyInterviewTimerUpdate(
  current: InterviewTimerClientState,
  payload: InterviewTimerPayload,
  config: unknown | null,
  now: number
): InterviewTimerClientState {
  const interviewStartedAt =
    typeof payload.interviewStartedAt === "number"
      ? payload.interviewStartedAt
      : current.interviewStartedAt;
  const timeExtensionMinutes =
    typeof payload.timeExtensionMinutes === "number"
      ? payload.timeExtensionMinutes
      : current.timeExtensionMinutes;

  let interviewEndsAt: number | null = current.interviewEndsAt;
  if (typeof payload.interviewEndsAt === "number") {
    interviewEndsAt = payload.interviewEndsAt;
  } else if (interviewStartedAt != null) {
    interviewEndsAt = interviewDeadlineMs(
      interviewStartedAt,
      interviewDurationMinutes(config),
      timeExtensionMinutes
    );
  }

  let lastTimeExtension = current.lastTimeExtension;
  if (payload.minutesAdded === 30 || payload.minutesAdded === 60) {
    lastTimeExtension = { at: now, minutes: payload.minutesAdded };
  }

  return {
    interviewStartedAt,
    timeExtensionMinutes,
    interviewEndsAt,
    lastTimeExtension,
  };
}

/** Mirrors party/index.ts `time-extension` → broadcast payload. */
export function buildInterviewTimeBroadcastPayload(
  server: PartyClockState,
  addMinutes: 30 | 60,
  now: number
): InterviewTimerPayload | null {
  if (server.phase !== "interview") return null;

  const durationMin = interviewDurationMinutes(server.config);
  const startedAt = server.interviewStartedAt ?? now;
  const timeExtensionMinutes = nextTimeExtensionMinutes(
    server.interviewStartedAt,
    durationMin,
    server.timeExtensionMinutes,
    addMinutes
  );
  const interviewEndsAt = interviewDeadlineMs(startedAt, durationMin, timeExtensionMinutes);

  return {
    interviewStartedAt: server.interviewStartedAt,
    timeExtensionMinutes,
    ...(interviewEndsAt != null ? { interviewEndsAt } : {}),
    minutesAdded: addMinutes,
  };
}

export type InterviewTimerDisplay = {
  deadlineMs: number | null;
  remainingMs: number | null;
  scheduleExpired: boolean;
  timeWasExtended: boolean;
  plannedTotalMinutes: number;
  showCandidateExtensionBanner: boolean;
  showHostWaitingForTimeBanner: boolean;
};

/** Countdown + banners (used by RoomPageClient for host and candidate). */
export function deriveInterviewTimerDisplay(opts: {
  phase: "setup" | "interview" | "review";
  clockNow: number;
  interviewStartedAt: number | null;
  interviewEndsAt: number | null;
  timeExtensionMinutes: number;
  interviewDurationMinutes: number;
  lastTimeExtension: { at: number; minutes: 30 | 60 } | null;
}): InterviewTimerDisplay {
  const plannedTotalMinutes = opts.interviewDurationMinutes + opts.timeExtensionMinutes;
  const deadlineMs =
    opts.interviewEndsAt ??
    (opts.phase === "interview"
      ? interviewDeadlineMs(
          opts.interviewStartedAt,
          opts.interviewDurationMinutes,
          opts.timeExtensionMinutes
        )
      : null);
  const remainingMs =
    deadlineMs != null ? Math.max(0, deadlineMs - opts.clockNow) : null;
  const scheduleExpired = Boolean(
    deadlineMs != null && remainingMs === 0 && opts.phase === "interview"
  );
  const timeWasExtended =
    opts.lastTimeExtension != null && remainingMs != null && remainingMs > 0;

  return {
    deadlineMs,
    remainingMs,
    scheduleExpired,
    timeWasExtended,
    plannedTotalMinutes,
    showCandidateExtensionBanner:
      opts.phase === "interview" && timeWasExtended && opts.lastTimeExtension != null,
    showHostWaitingForTimeBanner:
      opts.phase === "interview" && scheduleExpired && !timeWasExtended,
  };
}
