import type { TranscriptAnalysisEntry } from "@/types/room";

export const TRANSCRIPT_ANALYSIS_DEBOUNCE_MS = 4000;
export const TRANSCRIPT_ANALYSIS_GATE_CHARS = 40;
export const TRANSCRIPT_ANALYSIS_GATE_LINES = 2;
export const TRANSCRIPT_ANALYSIS_MIN_CHARS = 28;
export const TRANSCRIPT_ANALYSIS_WINDOW_LINES = 40;

const ALLOWED_ANSWER_QUALITIES = new Set([
  "strong",
  "adequate",
  "weak",
  "insufficient",
  "n/a",
]);

export type TranscriptLine = { speaker: string; text: string };

/** Build the spoken window the host sends to /api/analyze-transcript. */
export function buildTranscriptAnalysisWindow(
  transcript: TranscriptLine[],
  lastAnalyzedLength: number
): { newLines: TranscriptLine[]; windowText: string } {
  const newLines = transcript.slice(lastAnalyzedLength);
  const windowText = newLines
    .slice(-TRANSCRIPT_ANALYSIS_WINDOW_LINES)
    .map((e) => `${e.speaker}: ${e.text}`)
    .join("\n")
    .trim();
  return { newLines, windowText };
}

/** Whether enough new transcript exists to schedule background analysis (host-only caller). */
export function shouldScheduleTranscriptAnalysis(
  transcript: TranscriptLine[],
  lastAnalyzedLength: number
): boolean {
  const { newLines, windowText } = buildTranscriptAnalysisWindow(transcript, lastAnalyzedLength);
  return (
    windowText.length >= TRANSCRIPT_ANALYSIS_GATE_CHARS ||
    newLines.length >= TRANSCRIPT_ANALYSIS_GATE_LINES
  );
}

/** Minimum window length before calling the analyze API (debounced handler). */
export function transcriptWindowReadyForApi(windowText: string): boolean {
  return windowText.length >= TRANSCRIPT_ANALYSIS_MIN_CHARS;
}

/** Shared normalization for analyze-transcript API JSON (route + room client). */
export function normalizeTranscriptAnalysisResponse(
  data: {
    summary?: string;
    score?: number;
    answerQuality?: string;
    followUpQuestions?: unknown;
  },
  meta: { id: string; timestamp: number; transcriptEndLength: number }
): TranscriptAnalysisEntry | null {
  if (typeof data.summary !== "string" || !data.summary.trim()) return null;

  const answerQuality = ALLOWED_ANSWER_QUALITIES.has(String(data.answerQuality))
    ? (data.answerQuality as TranscriptAnalysisEntry["answerQuality"])
    : "n/a";

  const score =
    typeof data.score === "number" && data.score >= 0 && data.score <= 10 ? data.score : 0;

  const followUpQuestions =
    answerQuality === "n/a"
      ? []
      : Array.isArray(data.followUpQuestions)
        ? data.followUpQuestions
            .filter((q): q is string => typeof q === "string")
            .map((q) => q.trim())
            .filter((q) => q.length > 0 && q.length <= 240)
            .slice(0, 3)
        : [];

  return {
    id: meta.id,
    timestamp: meta.timestamp,
    transcriptEndLength: meta.transcriptEndLength,
    summary: data.summary.trim(),
    score,
    answerQuality,
    followUpQuestions,
  };
}
