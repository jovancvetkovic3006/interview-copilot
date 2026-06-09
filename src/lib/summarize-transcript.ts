import Anthropic from "@anthropic-ai/sdk";

/**
 * Single source of truth for end-of-interview transcript summarization. Reused by:
 *   - POST /api/summarize-transcript   (standalone endpoint, e.g. mid-interview "summarize so far" UI)
 *   - POST /api/interview-report       (called inline before generating the final report)
 */

const MODEL_FALLBACK_CHAIN = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
];

export interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp?: number;
}

export interface SummarizeTranscriptInput {
  transcript: TranscriptLine[];
  role?: string;
  difficulty?: string;
  topics?: string[];
  candidateName?: string;
}

/** Hard upper bound on how much raw transcript we send to the summarizer in one call. */
const MAX_TRANSCRIPT_CHARS = 80_000;

function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  // Keep the start (interview opens) and end (closes / wrap-up); drop the middle.
  // The summarizer notices the marker and won't fabricate the missing section.
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n[…middle of transcript truncated for length…]\n\n${text.slice(-tail)}`;
}

/**
 * Produces a Markdown summary of the whole spoken transcript suitable for downstream
 * reasoning (final report, hiring-panel review, etc.). Returns empty string when there
 * is no transcript to summarize. Throws on Anthropic errors so callers can surface them.
 */
export async function summarizeTranscript(input: SummarizeTranscriptInput): Promise<string> {
  const { transcript, role, difficulty, topics, candidateName } = input;
  if (!transcript || transcript.length === 0) return "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  const client = new Anthropic({ apiKey });

  const joined = transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n");
  const transcriptBody = truncateMiddle(joined, MAX_TRANSCRIPT_CHARS);

  const system = `Summarize a technical interview transcript for the hiring panel.
Role: ${difficulty || "mid"}-level ${role || "software"}. Topics: ${(topics || ["general"]).join(", ")}. Candidate: ${candidateName || "the candidate"}.

Rules:
- Facts from the transcript only. Do not invent.
- Omit a section when there is nothing to say. Never mention missing data, STT limits, or what you could not infer.
- No process commentary or hedging paragraphs. Short bullets and sentences only.
- Mark a specific garbled phrase "(unclear)" inline — do not discuss recognition quality globally.
- English only. Non-English quotes: original + [English: "…"].

Sections (skip empty ones):
## Overview — 1–2 sentences
## Topics — chronological bullets: topic + outcome (one line each)
## Strengths — up to 4 bullets; short quotes when clear
## Gaps — up to 4 bullets; struggles visible in the transcript only
## Q&A — substantive questions → one-line outcome each

Max ~400 words. Markdown only — no preamble, no wrapper code fence.`;

  let lastError: unknown = null;
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const completion = await client.messages.create({
        model,
        system,
        messages: [{ role: "user", content: `SPOKEN TRANSCRIPT:\n${transcriptBody}` }],
        temperature: 0.2,
        max_tokens: 1200,
      });
      const text =
        completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "";
      // Strip stray code fences if the model wrapped the document despite instructions.
      return text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "");
    } catch (err) {
      lastError = err;
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 404
      ) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
