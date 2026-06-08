import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeTranscriptAnalysisResponse } from "@/lib/transcript-analysis";

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
      panelParticipants,
    } = body as {
      transcriptWindow: string;
      recentChat?: { speaker: string; content: string }[];
      role?: string;
      difficulty?: string;
      topics?: string[];
      candidateName?: string;
      panelParticipants?: { name: string; role: "interviewer" | "candidate" }[];
    };

    if (!transcriptWindow || typeof transcriptWindow !== "string" || transcriptWindow.trim().length < 20) {
      return NextResponse.json({ error: "transcriptWindow required (min 20 chars)" }, { status: 400 });
    }

    const chatBlock =
      recentChat && recentChat.length > 0
        ? recentChat.map((m) => `${m.speaker}: ${m.content}`).join("\n")
        : "(no typed chat in this window)";

    const panelBlock =
      panelParticipants && panelParticipants.length > 0
        ? panelParticipants.map((p) => `- ${p.name} (${p.role})`).join("\n")
        : `(candidate: ${candidateName || "the candidate"}; interviewers may appear by name in the transcript)`;

    const system = `You are an expert interview coach helping ONLY the hiring panel (not the candidate).
You receive a short window of LIVE SPEECH TRANSCRIPT from a technical interview (may contain errors from speech-to-text).
Lines are labeled by speaker name and may include **multiple interviewers** and the **candidate** (each person records on their own device).
The interview is for a ${difficulty || "mid"} level ${role || "software"} role. Topics: ${(topics || ["general"]).join(", ")}.
The primary candidate is named ${candidateName || "the candidate"}.

Panel in the room:
${panelBlock}

Your job:
- Read the full window: candidate answers **and** what interviewers asked or clarified.
- Infer whether the candidate likely answered an interview question vs small talk / silence / interviewer-only lines.
- If there is no substantive candidate answer, set answerQuality to "n/a" and score 0 with a brief summary explaining why.
- Otherwise rate how strong the candidate's (spoken) answer appears: depth, clarity, relevance, and technical correctness where applicable.
- Be concise and fair; transcript may be imperfect.
- Suggest **one** short next question (≤ ~20 words) the interviewer could ask to dig deeper.
  Build on what the candidate just said — not generic. If answerQuality is "n/a", return [].
- Write "summary" as a **one-sentence scoring hint** (what a strong vs weak answer would show).

LANGUAGE: The transcript may be in Serbian (Cyrillic or Latin), English, or a mix. **Always write
"summary" and every entry in "followUpQuestions" in English** even if the source is Serbian.

Respond with ONLY valid JSON (no markdown):
{
  "summary": "<one-sentence scoring hint for the interviewer>",
  "score": <integer 1-10, or 0 if n/a>,
  "answerQuality": "<one of: strong, adequate, weak, insufficient, n/a>",
  "followUpQuestions": ["<single next best question, or empty if n/a>"]
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
    let json: {
      summary: string;
      score: number;
      answerQuality: string;
      followUpQuestions?: unknown;
    };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      return NextResponse.json({ error: "Invalid model response" }, { status: 500 });
    }

    const normalized = normalizeTranscriptAnalysisResponse(json, {
      id: "api",
      timestamp: Date.now(),
      transcriptEndLength: 0,
    });
    if (!normalized) {
      return NextResponse.json({ error: "Invalid model response" }, { status: 500 });
    }

    return NextResponse.json({
      summary: normalized.summary,
      score: normalized.score,
      answerQuality: normalized.answerQuality,
      followUpQuestions: normalized.followUpQuestions ?? [],
    });
  } catch (error: unknown) {
    console.error("analyze-transcript error:", error);
    let message = "Failed to analyze transcript";
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
