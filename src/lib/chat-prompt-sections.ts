/** Manual question scores block appended to the interviewer assistant system prompt. */
export function formatManualQuestionScoresPromptSection(
  scores: {
    question: string;
    score: number;
    scoreLabel?: string;
    category?: string;
    scoredAt?: number;
  }[]
): string {
  if (scores.length === 0) return "";

  const lines = scores
    .map(
      (s, idx) =>
        `${idx + 1}. [${s.score}/10${s.scoreLabel ? ` ${s.scoreLabel}` : ""}]${s.category ? ` [${s.category}]` : ""} ${s.question}${
          s.scoredAt ? ` (scored ${new Date(s.scoredAt).toISOString()})` : ""
        }`
    )
    .join("\n");

  return `

MANUAL QUESTION SCORES (interviewer-rated 1–10 after asking questions — authoritative; use for follow-ups):
${lines}

When scores are present: reference them when suggesting next questions — probe weak scores (≤5) deeply, validate strong ones (≥8) with harder variants, and avoid repeating topics already rated highly unless checking depth.`;
}
