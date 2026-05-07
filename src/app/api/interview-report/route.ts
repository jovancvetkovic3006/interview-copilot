import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL_FALLBACK_CHAIN = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-6",
];

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set. Please add it to .env.local");
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
        console.warn(`Model ${model} not found, trying next...`);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      roomCode,
      participants,
      messages,
      transcript,
      transcriptAnalyses,
      config,
      codingTask,
      finalCode,
    } = body as {
      roomCode?: string;
      participants?: { name: string; role: string }[];
      messages?: { senderName: string; role: string; content: string; timestamp?: number }[];
      transcript?: { speaker: string; text: string; timestamp?: number }[];
      transcriptAnalyses?: { summary: string; score: number; answerQuality: string; timestamp?: number }[];
      config?: Record<string, unknown>;
      codingTask?: unknown;
      /** Snapshot of the live collaborative editor at end-of-interview. May be empty if no task was assigned. */
      finalCode?: string;
    };

    const chatBlock = (messages ?? [])
      .slice(-200)
      .map((m) => `[${m.role}] ${m.senderName}: ${m.content}`)
      .join("\n");
    const transcriptBlock = (transcript ?? [])
      .slice(-300)
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");
    const analysisBlock = (transcriptAnalyses ?? [])
      .slice(-40)
      .map((a) => `- (${a.answerQuality}, score ${a.score}) ${a.summary}`)
      .join("\n");

    const participantsBlock = (participants ?? []).map((p) => `- ${p.name} (${p.role})`).join("\n");
    const configStr = truncate(JSON.stringify(config ?? {}, null, 2), 12_000);
    const codingStr = truncate(JSON.stringify(codingTask ?? null, null, 2), 8000);

    // Coding task language is used as the fenced-code block hint for `finalCode` so the model
    // (and any reader of the report) can syntax-reason about it. Falls back to "text".
    const codingLang =
      (codingTask && typeof codingTask === "object" && "language" in codingTask
        ? String((codingTask as { language?: unknown }).language ?? "")
        : "") || "text";

    const finalCodeTrimmed = (finalCode ?? "").trim();
    const finalCodeBlock = finalCodeTrimmed
      ? `\`\`\`${codingLang}\n${truncate(finalCodeTrimmed, 30_000)}\n\`\`\``
      : "(no in-room coding task code captured — either no task was assigned, or the candidate left the editor empty)";

    const userContent = `You are writing the official post-interview packet for the hiring panel.

Room code: ${roomCode || "(unknown)"}

PARTICIPANTS:
${participantsBlock || "(none)"}

INTERVIEW CONFIG (JSON):
${configStr}

CODING TASK METADATA (the assigned task definition):
${codingStr}

FINAL CODE FROM THE SHARED IN-ROOM EDITOR (the candidate's actual code at end-of-interview, including any edits made to a pre-loaded take-home submission):
${finalCodeBlock}

FULL TYPED CHAT + AGENT (most recent last, truncated if huge):
${truncate(chatBlock, 70_000)}

SPOKEN TRANSCRIPT (chronological, may contain STT errors):
${truncate(transcriptBlock, 70_000)}

SPEECH INSIGHT SNIPPETS (interviewer-only analyses during the session):
${truncate(analysisBlock, 20_000)}

Write a structured **Markdown** report suitable for PDF export. Include:
1. Title with role/difficulty and candidate name if inferable
2. Executive summary (5–8 bullets)
3. Strengths observed (with evidence from chat or transcript)
4. Gaps / risks / follow-up questions
5. Coding / system design signal — read the FINAL CODE block above (if present) and assess: correctness, edge cases handled / missed, complexity, code style, and how the candidate evolved the code during the discussion (chat/transcript may show their reasoning). Quote short snippets when calling out specific issues.
6. Recommended decision hint (hire / no-hire / more rounds) — phrased as guidance for humans, not a command
7. Optional: timeline table if useful

Tone: professional, concise, fair. Do not invent facts not supported by the materials.
Output **only** Markdown (no JSON wrapper, no code fences around the whole document).`;

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system:
        "You produce interview close-out documentation for internal hiring use only. Output Markdown only.",
      messages: [{ role: "user", content: userContent }],
      temperature: 0.35,
      max_tokens: 6000,
    });

    let markdown =
      completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "";
    if (markdown.startsWith("```")) {
      markdown = markdown.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "");
    }
    if (!markdown) {
      return NextResponse.json({ error: "Empty model response" }, { status: 500 });
    }

    return NextResponse.json({ markdown });
  } catch (error: unknown) {
    console.error("interview-report error:", error);
    let message = "Failed to generate interview report";
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
