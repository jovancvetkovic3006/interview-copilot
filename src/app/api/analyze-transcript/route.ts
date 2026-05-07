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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transcriptWindow,
      recentChat,
      role,
      difficulty,
      topics,
      candidateName,
    } = body as {
      transcriptWindow: string;
      recentChat?: { speaker: string; content: string }[];
      role?: string;
      difficulty?: string;
      topics?: string[];
      candidateName?: string;
    };

    if (!transcriptWindow || typeof transcriptWindow !== "string" || transcriptWindow.trim().length < 20) {
      return NextResponse.json({ error: "transcriptWindow required (min 20 chars)" }, { status: 400 });
    }

    const chatBlock =
      recentChat && recentChat.length > 0
        ? recentChat.map((m) => `${m.speaker}: ${m.content}`).join("\n")
        : "(no typed chat in this window)";

    const system = `You are an expert interview coach helping ONLY the hiring panel (not the candidate).
You receive a short window of LIVE SPEECH TRANSCRIPT from a technical interview (may contain errors from speech-to-text).
The interview is for a ${difficulty || "mid"} level ${role || "software"} role. Topics: ${(topics || ["general"]).join(", ")}.
The primary candidate is named ${candidateName || "the candidate"}.

Your job:
- Infer whether the candidate likely answered an interview question vs small talk / silence / interviewer-only.
- If there is no substantive candidate answer, set answerQuality to "n/a" and score 0 with a brief summary explaining why.
- Otherwise rate how strong the (spoken) answer appears: depth, clarity, relevance, and technical correctness where applicable.
- Be concise and fair; transcript may be imperfect.

Respond with ONLY valid JSON (no markdown):
{
  "summary": "<2-4 sentences for the interviewer>",
  "score": <integer 1-10, or 0 if n/a>,
  "answerQuality": "<one of: strong, adequate, weak, insufficient, n/a>"
}`;

    const userContent = `RECENT TYPED CHAT (for question context):\n${chatBlock}\n\nSPOKEN TRANSCRIPT WINDOW:\n${transcriptWindow}`;

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.25,
      max_tokens: 800,
    });

    let text =
      completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "{}";
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    }
    let json: { summary: string; score: number; answerQuality: string };
    try {
      json = JSON.parse(text) as { summary: string; score: number; answerQuality: string };
    } catch {
      return NextResponse.json({ error: "Invalid model response" }, { status: 500 });
    }

    const allowed = new Set(["strong", "adequate", "weak", "insufficient", "n/a"]);
    const answerQuality = allowed.has(json.answerQuality) ? json.answerQuality : "n/a";
    const score = typeof json.score === "number" && json.score >= 0 && json.score <= 10 ? json.score : 0;

    return NextResponse.json({
      summary: typeof json.summary === "string" ? json.summary : "",
      score,
      answerQuality,
    });
  } catch (error: unknown) {
    console.error("analyze-transcript error:", error);
    let message = "Failed to analyze transcript";
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
