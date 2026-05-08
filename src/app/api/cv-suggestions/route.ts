import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Reads uploaded CV / bio text and produces tailored interview suggestions for the
 * INTERVIEWER ONLY (these never reach the candidate or the live agent prompt).
 *
 * Output shape (JSON):
 * {
 *   questions:  [{ question, category, rationale }],
 *   codingTasks:[{ title, description, language, starterCode, rationale }],
 *   topicsToProbe: string[]
 * }
 *
 * Every suggestion is grounded in the CV — `rationale` cites the specific experience that
 * motivated it. Returns empty arrays (200) when there's nothing useful to say.
 */

const MODEL_FALLBACK_CHAIN = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
];

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function createMessageWithFallback(
  client: Anthropic,
  params: Omit<Anthropic.Messages.MessageCreateParamsNonStreaming, "model">
) {
  let lastError: unknown = null;
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      return await client.messages.create({ ...params, model });
    } catch (err: unknown) {
      lastError = err;
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated for length…]`;
}

interface UploadedFileInput {
  name?: string;
  type?: string;
  text?: string;
}

interface SuggestedQuestion {
  question: string;
  category: string;
  rationale: string;
}

interface SuggestedCodingTask {
  title: string;
  description: string;
  language: string;
  starterCode: string;
  difficulty?: "junior" | "mid" | "senior" | "lead";
  rationale: string;
}

interface SuggestionsResponse {
  questions: SuggestedQuestion[];
  codingTasks: SuggestedCodingTask[];
  topicsToProbe: string[];
}

const EMPTY: SuggestionsResponse = { questions: [], codingTasks: [], topicsToProbe: [] };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uploadedFiles, role, difficulty, topics, candidateName } = body as {
      uploadedFiles?: UploadedFileInput[];
      role?: string;
      difficulty?: string;
      topics?: string[];
      candidateName?: string;
    };

    // Restrict to CV / bio docs — random uploads aren't necessarily candidate background.
    const cvDocs = (uploadedFiles ?? []).filter(
      (f) => (f?.type === "cv" || f?.type === "bio") && typeof f.text === "string" && f.text.trim().length > 50
    );
    if (cvDocs.length === 0) {
      return NextResponse.json(EMPTY);
    }

    const cvBlock = cvDocs
      .map(
        (f, i) =>
          `--- DOCUMENT ${i + 1} (${f.type === "cv" ? "CV/RESUME" : "BIOGRAPHY"}: ${f.name ?? "untitled"}) ---\n${truncate(String(f.text), 25_000)}`
      )
      .join("\n\n");

    const system = `You are an interview-prep assistant helping a HUMAN INTERVIEWER prepare a tailored technical interview.
You are reading the candidate's CV / bio. Your suggestions go ONLY to the interviewer (a private side panel) — they are never shown to the candidate or sent to the live interview agent.

Your job is to generate CV-tailored:
1. **Questions** that probe specific experience claims (frameworks, projects, achievements, ownership).
2. **Coding tasks** that match technologies the candidate explicitly used in real work (so the discussion can go beyond surface-level).
3. **Topics to probe** — short list of areas where the CV hints at depth (or where it hints at gaps worth verifying).

For each suggestion, include a one-sentence \`rationale\` that quotes or paraphrases the specific CV evidence (e.g. "CV mentions 5 years of Spring Boot at Acme Corp"). NEVER fabricate experience that isn't in the CV.

Calibrate to the role and seniority. Do NOT generate generic questions/tasks (the app already has those — these should be CV-specific).

Output strict JSON in this exact shape (no markdown, no code fences):
{
  "questions": [
    { "question": "...", "category": "<topic>", "rationale": "..." }
  ],
  "codingTasks": [
    { "title": "...", "description": "...", "language": "<javascript|typescript|python|...>", "starterCode": "...", "difficulty": "<junior|mid|senior|lead>", "rationale": "..." }
  ],
  "topicsToProbe": ["..."]
}

Limits: at most 6 questions, 3 coding tasks, 8 topics. Empty arrays are fine when the CV doesn't justify any. Keep \`starterCode\` short (≤ 12 lines) — typically a function signature plus a comment.`;

    const userContent = `Interview context:
- Role: ${role || "Software Developer"} (${difficulty || "mid"})
- Pre-selected topics: ${(topics || []).join(", ") || "(none specified)"}
- Candidate name: ${candidateName || "(unknown)"}

CANDIDATE DOCUMENTS:
${cvBlock}

Generate the JSON suggestions now.`;

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.3,
      max_tokens: 2500,
    });

    let text = completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "{}";
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("cv-suggestions: invalid JSON from model:", text.slice(0, 300));
      return NextResponse.json(EMPTY);
    }

    // Defensive shape coercion — the model occasionally returns near-misses.
    const safe: SuggestionsResponse = {
      questions: Array.isArray((parsed as { questions?: unknown }).questions)
        ? ((parsed as { questions: unknown[] }).questions
            .filter(
              (q): q is SuggestedQuestion =>
                !!q && typeof q === "object" && typeof (q as { question?: unknown }).question === "string"
            )
            .map((q) => ({
              question: String(q.question).trim(),
              category: String((q as { category?: unknown }).category ?? "General").trim() || "General",
              rationale: String((q as { rationale?: unknown }).rationale ?? "").trim(),
            }))
            .slice(0, 6))
        : [],
      codingTasks: Array.isArray((parsed as { codingTasks?: unknown }).codingTasks)
        ? ((parsed as { codingTasks: unknown[] }).codingTasks
            .filter(
              (t): t is SuggestedCodingTask =>
                !!t && typeof t === "object" && typeof (t as { title?: unknown }).title === "string"
            )
            .map((t) => ({
              title: String(t.title).trim(),
              description: String((t as { description?: unknown }).description ?? "").trim(),
              language: String((t as { language?: unknown }).language ?? "javascript").trim() || "javascript",
              starterCode: String((t as { starterCode?: unknown }).starterCode ?? "").trim(),
              difficulty: ((): SuggestedCodingTask["difficulty"] => {
                const d = String((t as { difficulty?: unknown }).difficulty ?? "").toLowerCase();
                return d === "junior" || d === "mid" || d === "senior" || d === "lead" ? d : undefined;
              })(),
              rationale: String((t as { rationale?: unknown }).rationale ?? "").trim(),
            }))
            .slice(0, 3))
        : [],
      topicsToProbe: Array.isArray((parsed as { topicsToProbe?: unknown }).topicsToProbe)
        ? ((parsed as { topicsToProbe: unknown[] }).topicsToProbe
            .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
            .map((t) => t.trim())
            .slice(0, 8))
        : [],
    };

    return NextResponse.json(safe);
  } catch (error: unknown) {
    console.error("cv-suggestions error:", error);
    let message = "Failed to generate CV suggestions";
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
