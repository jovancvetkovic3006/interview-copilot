import type { CodingTaskPreset, Difficulty, PredefinedQuestion, PresetStrand } from "@/types/interview";

export const FULL_STACK_ROLE = "Full Stack Developer";

export const DIFF_ORDER: Record<Difficulty, number> = {
  junior: 0,
  mid: 1,
  senior: 2,
  lead: 3,
};

const STRAND_ORDER: Record<PresetStrand, number> = { backend: 0, frontend: 1, fullstack: 2 };

const STRAND_LABEL: Record<PresetStrand, string> = {
  backend: "Backend (C# · .NET)",
  frontend: "Frontend (React)",
  fullstack: "Full stack",
};

/** Question applies to this interview level, or to all levels when `levels` is omitted. */
export function questionMatchesLevel(q: PredefinedQuestion, level: Difficulty): boolean {
  if (!q.levels?.length) return true;
  return q.levels.includes(level);
}

/** Show presets at or below the interview difficulty (e.g. senior sees junior+mid+senior tasks). */
export function taskMatchesLevel(task: CodingTaskPreset, level: Difficulty): boolean {
  return DIFF_ORDER[task.difficulty] <= DIFF_ORDER[level];
}

export function filterQuestionsForLevel(questions: PredefinedQuestion[], level: Difficulty): PredefinedQuestion[] {
  return questions.filter((q) => questionMatchesLevel(q, level));
}

export function filterTasksForLevel(tasks: CodingTaskPreset[], level: Difficulty): CodingTaskPreset[] {
  return tasks.filter((t) => taskMatchesLevel(t, level));
}

function strandOfQuestion(q: PredefinedQuestion): PresetStrand {
  return q.strand ?? "fullstack";
}

function strandOfTask(t: CodingTaskPreset): PresetStrand {
  return t.strand ?? "fullstack";
}

/** Highest difficulty tag on a leveled question (for sorting senior-first). */
function maxLevelsRank(q: PredefinedQuestion): number {
  if (!q.levels?.length) return -1;
  return Math.max(...q.levels.map((l) => DIFF_ORDER[l]));
}

function sortQuestionsLeveled(a: PredefinedQuestion, b: PredefinedQuestion, role: string): number {
  const ma = maxLevelsRank(a);
  const mb = maxLevelsRank(b);
  if (mb !== ma) return mb - ma;
  if (role === FULL_STACK_ROLE) {
    const sa = STRAND_ORDER[strandOfQuestion(a)];
    const sb = STRAND_ORDER[strandOfQuestion(b)];
    if (sa !== sb) return sa - sb;
  }
  return a.category.localeCompare(b.category) || a.id.localeCompare(b.id);
}

function sortQuestionsUniversal(a: PredefinedQuestion, b: PredefinedQuestion, role: string): number {
  if (role === FULL_STACK_ROLE) {
    const sa = STRAND_ORDER[strandOfQuestion(a)];
    const sb = STRAND_ORDER[strandOfQuestion(b)];
    if (sa !== sb) return sa - sb;
  }
  return a.category.localeCompare(b.category) || a.id.localeCompare(b.id);
}

function sortTasks(a: CodingTaskPreset, b: CodingTaskPreset, role: string): number {
  const da = DIFF_ORDER[a.difficulty];
  const db = DIFF_ORDER[b.difficulty];
  if (db !== da) return db - da;
  if (role === FULL_STACK_ROLE) {
    const sa = STRAND_ORDER[strandOfTask(a)];
    const sb = STRAND_ORDER[strandOfTask(b)];
    if (sa !== sb) return sa - sb;
  }
  return a.id.localeCompare(b.id);
}

export interface PresetGroup<T> {
  heading: string;
  items: T[];
}

const STRANDS_ORDERED: PresetStrand[] = ["backend", "frontend", "fullstack"];

/**
 * Seniority-matched questions first (hardest tag first), then universal.
 * Full Stack: sub-grouped by strand (C# backend, React frontend, shared full stack).
 */
export function buildQuestionGroups(questions: PredefinedQuestion[], level: Difficulty, role: string): PresetGroup<PredefinedQuestion>[] {
  const filtered = filterQuestionsForLevel(questions, level);
  const leveled = filtered.filter((q) => q.levels?.length);
  const universal = filtered.filter((q) => !q.levels?.length);
  const sortedLeveled = [...leveled].sort((a, b) => sortQuestionsLeveled(a, b, role));
  const sortedUniversal = [...universal].sort((a, b) => sortQuestionsUniversal(a, b, role));

  const groups: PresetGroup<PredefinedQuestion>[] = [];

  if (role === FULL_STACK_ROLE && sortedLeveled.length > 0) {
    for (const s of STRANDS_ORDERED) {
      const items = sortedLeveled.filter((q) => strandOfQuestion(q) === s);
      if (items.length > 0) {
        groups.push({ heading: `Matched to ${level} · ${STRAND_LABEL[s]}`, items });
      }
    }
  } else if (sortedLeveled.length > 0) {
    groups.push({ heading: `Matched to ${level} level`, items: sortedLeveled });
  }

  if (role === FULL_STACK_ROLE && sortedUniversal.length > 0) {
    for (const s of STRANDS_ORDERED) {
      const items = sortedUniversal.filter((q) => strandOfQuestion(q) === s);
      if (items.length > 0) {
        groups.push({ heading: `All levels · ${STRAND_LABEL[s]}`, items });
      }
    }
  } else if (sortedUniversal.length > 0) {
    groups.push({ heading: "All levels", items: sortedUniversal });
  }

  return groups;
}

/**
 * Role-specific coding tasks first (by difficulty desc, then strand for Full Stack), then General.
 */
export function buildCodingTaskGroups(
  role: string,
  level: Difficulty,
  presets: Record<string, CodingTaskPreset[]>
): PresetGroup<CodingTaskPreset>[] {
  const roleTasks = filterTasksForLevel(presets[role] || [], level);
  const generalTasks = filterTasksForLevel(presets["General"] || [], level);
  const sortedRole = [...roleTasks].sort((a, b) => sortTasks(a, b, role));
  const sortedGen = [...generalTasks].sort((a, b) => sortTasks(a, b, role));

  const groups: PresetGroup<CodingTaskPreset>[] = [];

  if (role === FULL_STACK_ROLE && sortedRole.length > 0) {
    for (const s of STRANDS_ORDERED) {
      const items = sortedRole.filter((t) => strandOfTask(t) === s);
      if (items.length > 0) {
        groups.push({ heading: `${FULL_STACK_ROLE} · ${STRAND_LABEL[s]}`, items });
      }
    }
  } else if (sortedRole.length > 0) {
    groups.push({ heading: role, items: sortedRole });
  }

  if (sortedGen.length > 0) {
    groups.push({ heading: "General", items: sortedGen });
  }

  return groups;
}

export function flattenGroups<T>(groups: PresetGroup<T>[]): T[] {
  return groups.flatMap((g) => g.items);
}
