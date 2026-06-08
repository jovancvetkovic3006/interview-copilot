import type { Participant, TranscriptEntry } from "@/types/room";

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

/** Disambiguate when several participants share the same display name. */
export function formatTranscriptSpeakerDisplay(
  entry: Pick<TranscriptEntry, "speaker" | "speakerRole" | "participantId">,
  participants: Participant[]
): string {
  const roster = entry.participantId
    ? participants.find((p) => p.id === entry.participantId)
    : undefined;
  const name = (roster?.name ?? entry.speaker).trim() || entry.speaker;
  const role = entry.speakerRole ?? roster?.role;
  const peers = participants.filter((p) => (role ? p.role === role : true));
  const sameNamePeers = peers.filter(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (sameNamePeers.length > 1 && entry.participantId) {
    const idx = sameNamePeers.findIndex((p) => p.id === entry.participantId);
    if (idx >= 0) return `${name} #${idx + 1}`;
  }
  return name;
}
