import type { RoomState } from "@/types/room";

/** Whether PartyKit state indicates an interview that has already started. */
export function syncStateIndicatesLiveSession(s: {
  phase?: string;
  interviewStartedAt?: number | null;
  config?: unknown | null;
  codingTask?: unknown | null;
  activeQuiz?: unknown | null;
  codingTaskHistory?: unknown[];
  quizHistory?: unknown[];
}): boolean {
  return (
    s.phase === "interview" ||
    s.phase === "review" ||
    s.interviewStartedAt != null ||
    s.config != null ||
    s.codingTask != null ||
    s.activeQuiz != null ||
    (s.codingTaskHistory?.length ?? 0) > 0 ||
    (s.quizHistory?.length ?? 0) > 0
  );
}

/**
 * When reconnecting, ignore a stale `setup` snapshot if the client already knows
 * the interview was in progress (prevents "Waiting to start" after time extension).
 */
export function shouldIgnoreSyncPhaseDowngrade(opts: {
  interviewSeen: boolean;
  localPhase: RoomState["phase"];
  incomingPhase: RoomState["phase"];
}): boolean {
  return (
    opts.interviewSeen &&
    (opts.localPhase === "interview" || opts.localPhase === "review") &&
    opts.incomingPhase === "setup"
  );
}

/** Resolve phase from a full-state sync, coercing setup → interview when session evidence exists. */
export function resolveIncomingSyncPhase(
  incomingPhase: RoomState["phase"],
  serverState: Parameters<typeof syncStateIndicatesLiveSession>[0]
): RoomState["phase"] {
  if (incomingPhase === "setup" && syncStateIndicatesLiveSession(serverState)) {
    return "interview";
  }
  return incomingPhase;
}

/** Candidates must not see private agent messages in shared chat history. */
export function filterChatMessagesForRole<
  T extends { role: string },
>(messages: T[], participantRole: "interviewer" | "candidate" | null): T[] {
  if (participantRole === "candidate") {
    return messages.filter((m) => m.role !== "agent");
  }
  return messages;
}
