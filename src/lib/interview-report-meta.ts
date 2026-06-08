import type { InterviewReport } from "@/types/room";

export interface InterviewReportMeta {
  roomCode: string;
  candidateName: string;
  role: string;
  difficulty: string;
  generatedAt: number;
  hostName?: string;
}

export const BLOB_REPORT_PREFIX = "interview-reports";

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function reportMarkdownPath(roomCode: string): string {
  return `${BLOB_REPORT_PREFIX}/${normalizeRoomCode(roomCode)}/report.md`;
}

export function reportMetaPath(roomCode: string): string {
  return `${BLOB_REPORT_PREFIX}/${normalizeRoomCode(roomCode)}/meta.json`;
}

export function buildInterviewReportMeta(input: {
  roomCode: string;
  config?: Record<string, unknown> | null;
  participants?: { name: string; role: string }[];
  generatedAt: number;
}): InterviewReportMeta {
  const cfg = input.config ?? {};
  const host = input.participants?.find((p) => p.role === "interviewer");
  return {
    roomCode: normalizeRoomCode(input.roomCode),
    candidateName: String(cfg.candidateName ?? "Candidate").trim() || "Candidate",
    role: String(cfg.role ?? "Interview").trim() || "Interview",
    difficulty: String(cfg.difficulty ?? "mid").trim() || "mid",
    generatedAt: input.generatedAt,
    ...(host?.name ? { hostName: host.name } : {}),
  };
}

export function reportFromStored(markdown: string, generatedAt: number): InterviewReport {
  return { markdown, generatedAt };
}
