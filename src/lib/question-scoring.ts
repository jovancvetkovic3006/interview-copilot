/** Five-level manual scoring scale for interviewer question assessment. */
export const QUESTION_SCORE_LEVELS = [
  {
    value: 5,
    label: "Excellent",
    shortLabel: "On track",
    description: "Candidate is on track — strong, complete answer",
    color: "green",
  },
  {
    value: 4,
    label: "Good",
    shortLabel: "Good",
    description: "Solid answer with minor gaps",
    color: "emerald",
  },
  {
    value: 3,
    label: "Adequate",
    shortLabel: "Partial",
    description: "Partially answered — needs more probing",
    color: "amber",
  },
  {
    value: 2,
    label: "Weak",
    shortLabel: "Weak",
    description: "Struggling — vague or off topic",
    color: "orange",
  },
  {
    value: 1,
    label: "Not answering",
    shortLabel: "No answer",
    description: "Candidate is not addressing the question",
    color: "red",
  },
] as const;

export type QuestionScoreValue = (typeof QUESTION_SCORE_LEVELS)[number]["value"];

export function scoreLevelLabel(value: number): string {
  const level = QUESTION_SCORE_LEVELS.find((l) => l.value === value);
  return level ? `${level.label} — ${level.description}` : `Score ${value}/5`;
}
