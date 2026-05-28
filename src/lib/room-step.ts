import type { RoomState } from "@/types/room";

export type RoomUiStep = "join" | "setup" | "interview" | "review";

export type SessionLiveSignals = {
  phase: RoomState["phase"];
  interviewStartedAt: number | null;
  hasConfig: boolean;
  hasCodingTask: boolean;
  hasActiveQuiz: boolean;
  codingTaskHistoryCount: number;
  quizHistoryCount: number;
};

/** Whether the room has started (candidate should see interview UI, not waiting room). */
export function sessionIsLive(signals: SessionLiveSignals): boolean {
  return (
    signals.phase === "interview" ||
    signals.phase === "review" ||
    signals.interviewStartedAt != null ||
    signals.hasConfig ||
    signals.hasCodingTask ||
    signals.hasActiveQuiz ||
    signals.codingTaskHistoryCount > 0 ||
    signals.quizHistoryCount > 0
  );
}

/**
 * Which screen the room UI should show. PartyKit `phase` wins once live;
 * local `step` only applies before the session has started.
 */
export function resolveActiveStep(
  phase: RoomState["phase"],
  localStep: RoomUiStep,
  live: boolean
): RoomUiStep {
  if (phase === "review") return "review";
  if (phase === "interview" || (live && localStep !== "join")) return "interview";
  return localStep;
}
