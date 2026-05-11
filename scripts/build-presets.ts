/**
 * Reads YAML preset files under `data/questions/` and `data/coding-tasks/` and writes a single
 * TypeScript module the app imports (`src/data/presets.generated.ts`).
 *
 * Run via `npm run presets:build` (also fires automatically before `dev` and `build`).
 *
 * File layout:
 *   data/questions/<role-slug>.yaml      → { role: string, questions: PredefinedQuestion[] }
 *   data/coding-tasks/<role-slug>.yaml   → { role: string, tasks: CodingTaskPreset[] }
 *
 * Validation is intentionally simple — duplicate ids, missing required fields, invalid
 * difficulty/strand/levels values fail the build with a clear message instead of silently shipping
 * a broken preset.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const questionsDir = resolve(repoRoot, "data/questions");
const tasksDir = resolve(repoRoot, "data/coding-tasks");
const outFile = resolve(repoRoot, "src/data/presets.generated.ts");

const ALLOWED_DIFFICULTIES = new Set(["junior", "mid", "senior", "lead"]);
const ALLOWED_STRANDS = new Set(["frontend", "backend", "fullstack"]);

interface QuestionFile {
  role?: unknown;
  questions?: unknown;
}
interface TasksFile {
  role?: unknown;
  tasks?: unknown;
}

function fail(file: string, msg: string): never {
  console.error(`[build-presets] ${basename(file)}: ${msg}`);
  process.exit(1);
}

async function loadDir(dir: string): Promise<{ file: string; data: unknown }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const yamls = names.filter((n) => n.endsWith(".yaml") || n.endsWith(".yml")).sort();
  return Promise.all(
    yamls.map(async (name) => {
      const file = resolve(dir, name);
      const data = yaml.load(await readFile(file, "utf8"));
      return { file, data };
    })
  );
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function validateQuestion(file: string, q: unknown, seen: Set<string>): Record<string, unknown> {
  if (!q || typeof q !== "object" || Array.isArray(q)) fail(file, "expected question object");
  const obj = q as Record<string, unknown>;
  const id = asString(obj.id);
  const question = asString(obj.question);
  const category = asString(obj.category);
  if (!id) fail(file, `question is missing 'id': ${JSON.stringify(obj).slice(0, 120)}`);
  if (!question) fail(file, `question id=${id} is missing 'question'`);
  if (!category) fail(file, `question id=${id} is missing 'category'`);
  if (seen.has(id)) fail(file, `duplicate question id '${id}'`);
  seen.add(id);
  if (obj.levels !== undefined) {
    if (!Array.isArray(obj.levels)) fail(file, `question id=${id} has non-array 'levels'`);
    for (const l of obj.levels) {
      if (typeof l !== "string" || !ALLOWED_DIFFICULTIES.has(l)) {
        fail(file, `question id=${id} has invalid level '${String(l)}' (allowed: junior, mid, senior, lead)`);
      }
    }
  }
  if (obj.strand !== undefined && (typeof obj.strand !== "string" || !ALLOWED_STRANDS.has(obj.strand))) {
    fail(file, `question id=${id} has invalid strand '${String(obj.strand)}' (allowed: frontend, backend, fullstack)`);
  }
  return obj;
}

function validateTask(file: string, t: unknown, seen: Set<string>): Record<string, unknown> {
  if (!t || typeof t !== "object" || Array.isArray(t)) fail(file, "expected task object");
  const obj = t as Record<string, unknown>;
  const id = asString(obj.id);
  const title = asString(obj.title);
  const description = asString(obj.description);
  const starterCode = typeof obj.starterCode === "string" ? obj.starterCode : null;
  const language = asString(obj.language);
  const difficulty = asString(obj.difficulty);
  if (!id) fail(file, `task is missing 'id': ${JSON.stringify(obj).slice(0, 120)}`);
  if (!title) fail(file, `task id=${id} is missing 'title'`);
  if (!description) fail(file, `task id=${id} is missing 'description'`);
  if (starterCode === null) fail(file, `task id=${id} is missing 'starterCode' (use empty string for none)`);
  if (!language) fail(file, `task id=${id} is missing 'language'`);
  if (!difficulty || !ALLOWED_DIFFICULTIES.has(difficulty)) {
    fail(file, `task id=${id} has invalid difficulty '${String(difficulty)}' (allowed: junior, mid, senior, lead)`);
  }
  if (seen.has(id)) fail(file, `duplicate task id '${id}'`);
  seen.add(id);
  if (obj.strand !== undefined && (typeof obj.strand !== "string" || !ALLOWED_STRANDS.has(obj.strand))) {
    fail(file, `task id=${id} has invalid strand '${String(obj.strand)}'`);
  }
  if (obj.staticReview !== undefined && typeof obj.staticReview !== "boolean") {
    fail(file, `task id=${id} has non-boolean 'staticReview'`);
  }
  return obj;
}

async function main() {
  const questionFiles = await loadDir(questionsDir);
  const taskFiles = await loadDir(tasksDir);

  const questionsByRole: Record<string, Record<string, unknown>[]> = {};
  const seenQuestionIds = new Set<string>();
  for (const { file, data } of questionFiles) {
    const f = (data ?? {}) as QuestionFile;
    const role = asString(f.role);
    if (!role) fail(file, "missing top-level 'role' string");
    if (!Array.isArray(f.questions)) fail(file, "missing top-level 'questions' array");
    if (questionsByRole[role]) fail(file, `role '${role}' already defined in another file`);
    questionsByRole[role] = f.questions.map((q) => validateQuestion(file, q, seenQuestionIds));
  }

  const tasksByRole: Record<string, Record<string, unknown>[]> = {};
  const seenTaskIds = new Set<string>();
  for (const { file, data } of taskFiles) {
    const f = (data ?? {}) as TasksFile;
    const role = asString(f.role);
    if (!role) fail(file, "missing top-level 'role' string");
    if (!Array.isArray(f.tasks)) fail(file, "missing top-level 'tasks' array");
    if (tasksByRole[role]) fail(file, `role '${role}' already defined in another file`);
    tasksByRole[role] = f.tasks.map((t) => validateTask(file, t, seenTaskIds));
  }

  const banner = `// AUTO-GENERATED by scripts/build-presets.ts — do not edit by hand.
// Source: data/questions/*.yaml + data/coding-tasks/*.yaml
// Run \`npm run presets:build\` to regenerate.\n\n`;

  const body =
    `import type { PredefinedQuestion, CodingTaskPreset } from "@/types/interview";\n\n` +
    `export const PREDEFINED_QUESTIONS: Record<string, PredefinedQuestion[]> = ${JSON.stringify(
      questionsByRole,
      null,
      2
    )};\n\n` +
    `export const CODING_TASK_PRESETS: Record<string, CodingTaskPreset[]> = ${JSON.stringify(
      tasksByRole,
      null,
      2
    )};\n`;

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, banner + body, "utf8");
  console.log(
    `[build-presets] wrote ${outFile} (${Object.keys(questionsByRole).length} question roles, ${Object.keys(tasksByRole).length} task roles)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
