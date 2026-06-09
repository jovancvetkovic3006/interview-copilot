import { scoreLevelShortLabel } from "@/lib/question-scoring";

/** Shared compact format for automatic interviewer suggestions (chat + insights). */
export const COMPACT_SUGGESTION_SECTIONS = ["Next best question", "Scoring hint"] as const;

export const COMPACT_SUGGESTION_OUTPUT_INSTRUCTION = `Output format (strict — no other sections, lists, or preamble):
**Next best question**
<one sentence the interviewer can ask verbatim>

**Scoring hint**
<one short sentence: what a strong vs weak answer would signal>`;

export const PROACTIVE_SUGGESTION_PROMPT_HINT = `Based on the newest transcript insight only. ${COMPACT_SUGGESTION_OUTPUT_INSTRUCTION}`;

export const NEXT_QUESTIONS_ONLY_INSTRUCTION = `Reply with ONLY a "**Next questions**" section — no preamble, scoring hints, commentary, or other sections.
List 1–3 single-sentence follow-up questions (ready to read aloud). Use a numbered list.
Every question MUST deepen the SAME topic as the anchor question below — no new subjects, no jumping to transcript themes or other interview areas.`;

export function buildQuestionScoreFollowUpPromptHint(entry: {
  question: string;
  score: number;
  category?: string;
  isUpdate?: boolean;
}): string {
  const label = scoreLevelShortLabel(entry.score);
  const category = entry.category ? `Category: ${entry.category}. ` : "";
  const calibration =
    entry.score <= 4
      ? "The score is weak — ask clarifying follow-ups on the same topic or probe a simpler slice of it."
      : entry.score >= 8
        ? "The score is strong — ask one harder twist on the same topic (edge case, trade-off, production reality)."
        : "Probe gaps or verify claims while staying on the same topic.";

  return `Q&A FOLLOW-UP ONLY. Ignore live transcript, quiz, CV, and unrelated chat for this reply.

ANCHOR QUESTION (all follow-ups must relate to this — do not change topic):
"${entry.question}"

${category}${entry.isUpdate ? "Updated" : "New"} score: ${entry.score}/10 (${label}). ${calibration}

${NEXT_QUESTIONS_ONLY_INSTRUCTION}`;
}

const NEXT_QUESTIONS_HEADING =
  /(?:^|\n)\s*(?:#{1,4}\s*)?\*{0,2}\s*next questions?\s*\*{0,2}\s*:?\s*/i;

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

function extractNumberedQuestions(body: string, max: number): string[] {
  const questions: string[] = [];
  for (const line of body.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const listed = trimmed.match(/^(?:\d+[.)]|[-*•])\s+(.+)$/);
    if (listed) {
      questions.push(listed[1].trim());
    } else if (
      questions.length === 0 &&
      trimmed.length > 12 &&
      !/^\*{0,2}[a-z ]+\*{0,2}:?$/i.test(trimmed)
    ) {
      questions.push(trimmed);
    }
    if (questions.length >= max) break;
  }
  return questions;
}

/** Keep only 1–3 next-question suggestions (Q&A score flow). */
export function compactNextQuestionsReply(raw: string, max = 3): string {
  const text = raw.trim();
  if (!text) return "";

  let body =
    sliceBetween(text, NEXT_QUESTIONS_HEADING, EXTRA_SECTION_HEADING) ??
    sliceBetween(text, NEXT_QUESTION_HEADING, SCORING_HINT_HEADING) ??
    text;

  body = body.replace(/\*\*Scoring hint\*\*[\s\S]*/i, "").trim();

  let questions = extractNumberedQuestions(body, max);
  if (questions.length === 0) {
    questions = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/^(?:\d+[.)]|[-*•])\s+/, "").trim())
      .filter((p) => p.length > 12 && !p.startsWith("**"))
      .slice(0, max);
  }

  if (questions.length === 0) return text.slice(0, 280);

  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `**Next questions**\n${numbered}`;
}
