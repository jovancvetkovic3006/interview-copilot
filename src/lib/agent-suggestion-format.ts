/** Shared compact format for automatic interviewer suggestions (chat + insights). */
export const COMPACT_SUGGESTION_SECTIONS = ["Next best question", "Scoring hint"] as const;

export const COMPACT_SUGGESTION_OUTPUT_INSTRUCTION = `Output format (strict — no other sections, lists, or preamble):
**Next best question**
<one sentence the interviewer can ask verbatim>

**Scoring hint**
<one short sentence: what a strong vs weak answer would signal>`;

export const PROACTIVE_SUGGESTION_PROMPT_HINT = `Based on the newest transcript insight only. ${COMPACT_SUGGESTION_OUTPUT_INSTRUCTION}`;

export const QUESTION_SCORE_SUGGESTION_PROMPT_HINT = `The interviewer just submitted a manual score. ${COMPACT_SUGGESTION_OUTPUT_INSTRUCTION}`;

/** Minimum gap between automatic chat suggestions triggered by transcript insights (host only). */
export const PROACTIVE_SUGGESTION_MIN_INTERVAL_MS = 60_000;

const NEXT_QUESTION_HEADING = /(?:^|\n)\s*(?:#{1,4}\s*)?\*{0,2}\s*next best question\s*\*{0,2}\s*:?\s*/i;
const SCORING_HINT_HEADING = /(?:^|\n)\s*(?:#{1,4}\s*)?\*{0,2}\s*scoring hint\s*\*{0,2}\s*:?\s*/i;
const EXTRA_SECTION_HEADING =
  /(?:^|\n)\s*(?:#{1,4}\s*)?\*{0,2}\s*(?:follow-ups?|what to probe|quiz summary|alternatives?)\s*\*{0,2}\s*:?\s*/i;

function sliceBetween(text: string, start: RegExp, end: RegExp | null): string | null {
  const startMatch = start.exec(text);
  if (!startMatch) return null;
  const from = startMatch.index + startMatch[0].length;
  const rest = text.slice(from);
  if (!end) return rest.trim() || null;
  const endMatch = end.exec(rest);
  const chunk = (endMatch ? rest.slice(0, endMatch.index) : rest).trim();
  return chunk || null;
}

/** Keep only Next best question + Scoring hint from a model reply. */
export function compactAgentSuggestionReply(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  const nextQuestion = sliceBetween(text, NEXT_QUESTION_HEADING, SCORING_HINT_HEADING);
  const scoringHint = sliceBetween(text, SCORING_HINT_HEADING, EXTRA_SECTION_HEADING);

  const parts: string[] = [];
  if (nextQuestion) {
    parts.push(`**Next best question**\n${nextQuestion.replace(/\n{2,}/g, "\n").trim()}`);
  }
  if (scoringHint) {
    parts.push(`**Scoring hint**\n${scoringHint.replace(/\n{2,}/g, "\n").trim()}`);
  }

  if (parts.length > 0) return parts.join("\n\n");

  // Fallback: first paragraph only so chat stays short
  const firstBlock = text.split(/\n{2,}/)[0]?.trim();
  return firstBlock || text.slice(0, 280);
}
