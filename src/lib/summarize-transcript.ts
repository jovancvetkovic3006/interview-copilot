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

  const system = `You are summarizing a TECHNICAL INTERVIEW spoken transcript for the hiring panel.
The interview is for a ${difficulty || "mid"}-level ${role || "software"} role. Topics: ${(topics || ["general"]).join(", ")}.
Primary candidate: ${candidateName || "the candidate"}.

The transcript was captured by browser speech-to-text and may contain recognition errors.
Mark uncertain interpretations with "(unclear)". Do NOT invent facts not supported by the transcript.

Produce a concise, structured **Markdown** summary with these sections (in this order):

## Overview
2-4 sentence narrative of how the interview went end-to-end.

## Topics covered (chronological)
Bullet list. Each bullet: the topic + a 1-sentence note about depth and outcome.

## Candidate strengths
Bullets with **verbatim short quotes** ("...") from the candidate as evidence when possible.

## Candidate gaps / struggles
Bullets with quotes when relevant. Distinguish "didn't know X" from "explained X awkwardly".

## Questions asked and how they were handled
Bullet list mapping each substantive question to a one-line outcome (answered well / partial / struggled / skipped).

## Notable moments
Anything worth flagging — long silences, off-topic detours, particularly strong insight, hesitation patterns, etc.

Keep the whole summary under ~800 words. Use \`>\` blockquotes for direct candidate quotes.
Output ONLY the Markdown — no preamble, no code-fence wrapper around the document.`;

  let lastError: unknown = null;
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const completion = await client.messages.create({
        model,
        system,
        messages: [{ role: "user", content: `SPOKEN TRANSCRIPT:\n${transcriptBody}` }],
        temperature: 0.2,
        max_tokens: 2500,
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
