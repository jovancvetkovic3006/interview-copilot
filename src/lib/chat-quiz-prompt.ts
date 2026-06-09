import {
  formatFailedQuizQuestionsForPrompt,
  formatLiveQuizForPrompt,
  type LiveQuizAgentContext,
} from "@/lib/quiz-summary";

export const QUIZ_REVIEW_OUTPUT_INSTRUCTION = `Output format (strict — short, no filler):
**Failed** (omit entirely if there are no wrong/skipped answers)
- One line per failed item only: "Q<n>: <≤12 words on what they missed>"

**Ask the candidate**
1–3 numbered follow-up questions that probe ONLY the failed/skipped items above. One short sentence each.

Rules: Do NOT recap the score, praise correct answers, or write paragraphs. Wrong/skipped only.`;

/** Prompt for manual or automatic live-quiz review in interviewer chat. */
export function buildQuizReviewPromptHint(ctx: LiveQuizAgentContext): string {
  const failed = formatFailedQuizQuestionsForPrompt(ctx);
  return `Live quiz review for interviewer only — "${ctx.title}" (${ctx.status}).

${QUIZ_REVIEW_OUTPUT_INSTRUCTION}

Failed/skipped questions:
${failed}`;
}

/** Appends live-quiz sections to the interviewer assistant system prompt (mirrors /api/chat). */
export function appendLiveQuizToSystemPrompt(
  basePrompt: string,
  config: {
    liveQuizHistory?: LiveQuizAgentContext[];
    liveQuizContext?: LiveQuizAgentContext;
  }
): { prompt: string; includesReviewHints: boolean } {
  let prompt = basePrompt;
  let includesReviewHints = false;

  if (config.liveQuizHistory && config.liveQuizHistory.length > 0) {
    prompt += `

ALL LIVE QUIZZES THIS SESSION (newest last; candidate may revisit any from history):`;
    config.liveQuizHistory.forEach((quizCtx, idx) => {
      prompt += `\n\n--- Quiz ${idx + 1}: ${quizCtx.title} (${quizCtx.status}) ---\n${formatLiveQuizForPrompt(quizCtx)}`;
    });
  }

  if (config.liveQuizContext) {
    prompt += `

CURRENTLY SELECTED LIVE QUIZ (multiple-choice):
${formatLiveQuizForPrompt(config.liveQuizContext)}`;
    includesReviewHints = true;
  }

  return { prompt, includesReviewHints };
}
