import type { InterviewReport } from "@/types/room";

const KEY_PREFIX = "ic-interview-report-";

function storageKey(roomCode: string): string {
  return `${KEY_PREFIX}${roomCode.trim().toUpperCase()}`;
}

/** Persist report locally so interviewers can download after refresh or PartyKit reconnect. */
export function saveInterviewReport(roomCode: string, report: InterviewReport): void {
  if (!roomCode.trim() || !report.markdown?.trim()) return;
  try {
    localStorage.setItem(storageKey(roomCode), JSON.stringify(report));
  } catch {
    /* quota / private mode */
  }
}

export function loadInterviewReport(roomCode: string): InterviewReport | null {
  if (!roomCode.trim()) return null;
  try {
    const raw = localStorage.getItem(storageKey(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InterviewReport;
    if (typeof parsed.markdown !== "string" || typeof parsed.generatedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function downloadInterviewMarkdown(markdown: string, roomCode: string): void {
  const safe = roomCode.replace(/[^\w-]/g, "_");
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview-summary-${safe}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
