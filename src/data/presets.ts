/**
 * Q&A and coding-task presets.
 *
 * The data lives in YAML files under `data/questions/` and `data/coding-tasks/` (one file per role).
 * `npm run presets:build` regenerates `presets.generated.ts`, which this module re-exports. The
 * build script also runs automatically before `npm run dev` and `npm run build`.
 *
 * To add or update presets, edit the YAML files — never edit `presets.generated.ts` by hand.
 */
import type { CodingTaskPreset, PredefinedQuestion, ReviewTemplate } from "@/types/interview";
import {
  PREDEFINED_QUESTIONS as GENERATED_QUESTIONS,
  CODING_TASK_PRESETS as GENERATED_TASKS,
} from "./presets.generated";

export const PREDEFINED_QUESTIONS: Record<string, PredefinedQuestion[]> = GENERATED_QUESTIONS;
export const CODING_TASK_PRESETS: Record<string, CodingTaskPreset[]> = GENERATED_TASKS;

/**
 * Review templates are still defined inline — there are only a handful and they don't change often.
 * Move them to YAML the same way if that ever stops being true.
 */
export const REVIEW_TEMPLATES: ReviewTemplate[] = [
  {
    id: "default",
    name: "Standard Technical Review",
    description: "A balanced review with strengths, weaknesses, and recommendations.",
    categories: [
      "Technical Knowledge",
      "Problem Solving",
      "Communication",
      "Code Quality",
      "Cultural Fit",
    ],
  },
  {
    id: "deep-dive",
    name: "Deep Technical Dive",
    description: "Detailed technical assessment for senior roles.",
    categories: [
      "System Design",
      "Architecture",
      "Best Practices",
      "Performance",
      "Scalability",
      "Leadership",
    ],
  },
  {
    id: "junior",
    name: "Junior Developer Review",
    description: "Focused on potential, learning ability, and fundamentals.",
    categories: [
      "Fundamentals",
      "Learning Ability",
      "Problem Solving Approach",
      "Communication",
      "Growth Potential",
    ],
  },
];
