export type CodingTaskSubmissionForPrompt = {
  title: string;
  description: string;
  language: string;
  code: string;
  requestedBy?: "interviewer" | "candidate";
};

/** Appends in-room coding review context to the interviewer assistant system prompt. */
export function appendCodingReviewToSystemPrompt(
  basePrompt: string,
  submission: CodingTaskSubmissionForPrompt
): { prompt: string; includesReviewHints: boolean; reviewHint: string } {
  const fromInterviewer = submission.requestedBy === "interviewer";
  let prompt =
    basePrompt +
    `

IN-ROOM CODING TASK — REVIEW REQUEST:
${
  fromInterviewer
    ? "The human interviewer shared the candidate's current solution from the live shared editor and asked you to review it. They may send again as the candidate continues to edit."
    : "The candidate asked you to review their current solution (they may submit again while still working on the same task)."
}
Task title: ${submission.title}
Language: ${submission.language}
Task description:
${submission.description}

Their current shared-editor code:
\`\`\`${submission.language}
${submission.code}
\`\`\``;

  const reviewHint = fromInterviewer
    ? `- The interviewer asked you to evaluate the candidate's current in-room solution (see IN-ROOM CODING TASK above). Respond with concise, actionable feedback: what works, issues, complexity, tests/edge cases, and next steps. Address the candidate directly where appropriate. Stay conversational. Do not assign a new [CODING_TASK] unless the candidate has clearly finished this exercise and you are moving on.`
    : `- The candidate just requested feedback on their in-room coding solution (see IN-ROOM CODING TASK above). Respond with concise, actionable feedback: what works, issues, complexity, tests/edge cases, and next steps. Stay conversational. Do not assign a new [CODING_TASK] unless they have clearly finished this exercise and you are moving on.`;

  return { prompt, includesReviewHints: true, reviewHint };
}

/** Behavior bullets appended under "Your role and behavior" when a coding review is active. */
export function codingReviewBehaviorHint(
  submission: CodingTaskSubmissionForPrompt
): string {
  const { reviewHint } = appendCodingReviewToSystemPrompt("", submission);
  return reviewHint;
}
