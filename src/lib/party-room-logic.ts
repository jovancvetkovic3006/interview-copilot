import { interviewDurationMinutes, nextTimeExtensionMinutes } from "@/lib/interview-deadline";
import { upsertQuestionScoreEntry } from "@/lib/question-scoring";
import type {
  QuestionScoreEntry,
  TranscriptAnalysisEntry,
  TranscriptEntry,
} from "@/types/room";

export type PartyInterviewPhase = "setup" | "interview" | "review";

export type PartyClockState = {
  phase: PartyInterviewPhase;
  interviewStartedAt: number | null;
  timeExtensionMinutes: number;
  config: unknown | null;
};

/** Server-side phase transition (mirrors party/index.ts `phase` handler). */
export function applyServerPhaseTransition(
  state: PartyClockState,
  nextPhase: PartyInterviewPhase,
  now: number
): PartyClockState {
  const interviewStartedAt =
    nextPhase === "interview" && state.interviewStartedAt == null
      ? now
      : state.interviewStartedAt;
  return { ...state, phase: nextPhase, interviewStartedAt };
}

/** Server-side time extension (mirrors party/index.ts `time-extension` handler). */
export function applyServerTimeExtension(
  state: PartyClockState,
  addMinutes: 30 | 60,
  now: number
): PartyClockState | null {
  if (state.phase !== "interview") return null;
  const duration = interviewDurationMinutes(state.config);
  const timeExtensionMinutes = nextTimeExtensionMinutes(
    state.interviewStartedAt ?? now,
    duration,
    state.timeExtensionMinutes,
    addMinutes
  );
  return { ...state, timeExtensionMinutes };
}

export function applyServerQuestionScore(
  scores: QuestionScoreEntry[],
  entry: QuestionScoreEntry
): QuestionScoreEntry[] {
  return upsertQuestionScoreEntry(scores, entry);
}

/** Mirrors party/index.ts `transcript` handler append. */
export function applyServerTranscript(
  transcript: TranscriptEntry[],
  entry: TranscriptEntry
): TranscriptEntry[] {
  return [...transcript, entry];
}

/** Mirrors party/index.ts `transcript-analysis` handler append. */
export function applyServerTranscriptAnalysis(
  analyses: TranscriptAnalysisEntry[],
  analysis: TranscriptAnalysisEntry
): TranscriptAnalysisEntry[] {
  return [...analyses, analysis];
}

/** Attach a stable collaboration id to a coding task (party uses crypto.randomUUID). */
export function ensureCollaborationTaskId(
  task: unknown,
  collaborationTaskId: string
): unknown {
  if (task !== null && typeof task === "object" && !Array.isArray(task)) {
    return { ...(task as Record<string, unknown>), collaborationTaskId };
  }
  return task;
}
