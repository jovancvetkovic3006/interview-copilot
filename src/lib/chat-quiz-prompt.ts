import { formatLiveQuizForPrompt, type LiveQuizAgentContext } from "@/lib/quiz-summary";

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
