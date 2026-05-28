/** Ten-level manual scoring scale for interviewer question assessment. */
export const QUESTION_SCORE_LEVELS = [
  {
    value: 10,
    label: "Excellent",
    shortLabel: "Exceptional",
    description: "Outstanding answer with deep understanding and clear communication",
    color: "green",
  },
  {
    value: 9,
    label: "Very Strong",
    shortLabel: "Very strong",
    description: "Very strong answer with only small gaps",
    color: "emerald",
  },
  {
    value: 8,
    label: "Strong",
    shortLabel: "Strong",
    description: "Strong answer, mostly complete and relevant",
    color: "emerald",
  },
  {
    value: 7,
    label: "Good",
    shortLabel: "Good",
    description: "Good answer, but could be more structured or deeper",
    color: "lime",
  },
  {
    value: 6,
    label: "Mostly Good",
    shortLabel: "Mostly good",
    description: "Reasonable answer with notable omissions",
    color: "lime",
  },
  {
    value: 5,
    label: "Adequate",
    shortLabel: "Adequate",
    description: "Partially answered and needs follow-up probing",
    color: "amber",
  },
  {
    value: 4,
    label: "Weak-Adequate",
    shortLabel: "Borderline",
    description: "Some signal, but inconsistent and uncertain",
    color: "amber",
  },
  {
    value: 3,
    label: "Weak",
    shortLabel: "Weak",
    description: "Struggling answer; vague, shallow, or partially off-topic",
    color: "orange",
  },
  {
    value: 2,
    label: "Very Weak",
    shortLabel: "Very weak",
    description: "Very limited understanding shown",
    color: "red",
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
