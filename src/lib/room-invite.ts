import type { Participant } from "@/types/room";

export function buildRoomInviteUrl(
  baseOrigin: string,
  roomCode: string,
  role: Participant["role"]
): string {
  const code = roomCode.trim();
  if (role === "interviewer") return `${baseOrigin}/interview/${code}`;
  return `${baseOrigin}/invite/${code}`;
}

export function inviteRoleLabel(role: Participant["role"]): string {
  if (role === "interviewer") return "Interviewer (host)";
  return "Candidate";
}

/** Format milliseconds as `H:MM:SS` or `M:SS` for the interview countdown. */
export function formatRemainingMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
