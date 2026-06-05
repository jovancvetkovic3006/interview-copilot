import type { Participant } from "@/types/room";

/** Label + role for a live transcript line (avoids mixing candidate setup name with interviewer speech). */
export function resolveTranscriptSpeakerLabel(
  participant: Pick<Participant, "name" | "role"> | null | undefined,
  candidateNameFromSetup?: string
): { speaker: string; speakerRole: Participant["role"] | undefined } {
  if (!participant) {
    return { speaker: "Unknown", speakerRole: undefined };
  }
  if (participant.role === "candidate") {
    return {
      speaker: candidateNameFromSetup?.trim() || participant.name.trim() || "Candidate",
      speakerRole: "candidate",
    };
  }
  return {
    speaker: participant.name.trim() || "Interviewer",
    speakerRole: "interviewer",
  };
}
