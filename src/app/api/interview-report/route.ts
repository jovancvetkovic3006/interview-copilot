import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { summarizeTranscript } from "@/lib/summarize-transcript";
import {
  hasUsableTranscript,
  MIN_INTERVIEWER_SESSION_NOTES_CHARS,
} from "@/lib/interview-report-gate";

/**
 * If the spoken transcript has more than this many lines, we ask the dedicated transcript-summary
 * agent to produce a structured Markdown summary first, and feed that to the report agent as
 * primary context (along with the most recent N raw lines for direct quoting). Below this
 * threshold the raw transcript is short enough to send verbatim — no summarization needed.
 */
const TRANSCRIPT_SUMMARY_THRESHOLD = 30;
/** How many of the most recent raw transcript lines to keep alongside the summary, for evidence. */
const RAW_TAIL_LINES = 50;

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
      transcriptSummary: clientProvidedSummary,
      interviewerSessionNotes,
      codingTaskHistory,
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
      /**
       * Optional pre-computed Markdown summary of the spoken transcript. If supplied, we skip the
       * inline summarization call. (Useful when a UI already generated one mid-interview.)
       */
      transcriptSummary?: string;
      /**
       * Host-only notes when no live transcript was recorded — required in that case so the model
       * has spoken-signal context.
       */
      interviewerSessionNotes?: string;
      /**
       * Chronological list of distinct coding tasks opened in the room (host client), for a
       * dedicated "Coding summary" section in the report.
       */
      codingTaskHistory?: unknown[];
    };

    const chatBlock = (messages ?? [])
      .slice(-200)
      .map((m) => `[${m.role}] ${m.senderName}: ${m.content}`)
      .join("\n");
    const analysisBlock = (transcriptAnalyses ?? [])
      .slice(-40)
      .map((a) => `- (${a.answerQuality}, score ${a.score}) ${a.summary}`)
      .join("\n");

    const participantsBlock = (participants ?? []).map((p) => `- ${p.name} (${p.role})`).join("\n");
    const configStr = truncate(JSON.stringify(config ?? {}, null, 2), 12_000);
    const codingStr = truncate(JSON.stringify(codingTask ?? null, null, 2), 8000);

    const rawHistory = Array.isArray(codingTaskHistory) ? codingTaskHistory : [];
    const codingTaskHistorySanitized: Record<string, unknown>[] = [];
    for (const entry of rawHistory.slice(0, 40)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      const title = typeof e.title === "string" ? e.title.trim() : "";
      if (!title) continue;
      const row: Record<string, unknown> = {
        title: truncate(title, 400),
        description: truncate(typeof e.description === "string" ? e.description : "", 8000),
        language:
          typeof e.language === "string" && e.language.trim() ? e.language.trim().slice(0, 48) : "text",
      };
      if (typeof e.collaborationTaskId === "string" && e.collaborationTaskId.trim()) {
        row.collaborationTaskId = e.collaborationTaskId.trim().slice(0, 80);
      }
      if (typeof e.source === "string" && e.source.trim()) {
        row.source = e.source.trim().slice(0, 80);
      }
      if (typeof e.recordedAt === "number" && Number.isFinite(e.recordedAt)) {
        row.recordedAt = e.recordedAt;
      }
      codingTaskHistorySanitized.push(row);
    }
    const codingTaskHistoryStr = truncate(JSON.stringify(codingTaskHistorySanitized, null, 2), 100_000);

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

    /**
     * Spoken-transcript context for the report.
     *
     * Strategy:
     *  - If the transcript is short (≤ TRANSCRIPT_SUMMARY_THRESHOLD lines), send it verbatim.
     *    The summarizer would just paraphrase a short transcript, costing latency for no win.
     *  - If it's longer, generate a structured Markdown summary via the dedicated summary agent
     *    AND keep the most recent N raw lines so the report agent can pull direct quotes for
     *    "evidence". If summarization fails, gracefully degrade to a truncated raw transcript.
     */
    const transcriptLines = transcript ?? [];
    const sessionNotesTrimmed =
      typeof interviewerSessionNotes === "string" ? interviewerSessionNotes.trim() : "";

    if (!hasUsableTranscript(transcriptLines)) {
      if (sessionNotesTrimmed.length < MIN_INTERVIEWER_SESSION_NOTES_CHARS) {
        return NextResponse.json(
          {
            error: `No spoken transcript was captured. Add interviewer session notes (at least ${MIN_INTERVIEWER_SESSION_NOTES_CHARS} characters) summarizing what was discussed before generating the report.`,
          },
          { status: 400 }
        );
      }
    }

    const cfgRole = String((config as { role?: unknown } | undefined)?.role ?? "") || undefined;
    const cfgDifficulty =
      String((config as { difficulty?: unknown } | undefined)?.difficulty ?? "") || undefined;
    const cfgTopics =
      Array.isArray((config as { topics?: unknown } | undefined)?.topics)
        ? ((config as { topics: unknown[] }).topics.filter((t): t is string => typeof t === "string"))
        : undefined;
    const cfgCandidateName =
      String((config as { candidateName?: unknown } | undefined)?.candidateName ?? "") || undefined;

    let transcriptSummaryText = (clientProvidedSummary ?? "").trim();
    let transcriptSummaryError: string | null = null;
    if (
      !transcriptSummaryText &&
      hasUsableTranscript(transcriptLines) &&
      transcriptLines.length > TRANSCRIPT_SUMMARY_THRESHOLD
    ) {
      try {
        transcriptSummaryText = await summarizeTranscript({
          transcript: transcriptLines,
          role: cfgRole,
          difficulty: cfgDifficulty,
          topics: cfgTopics,
          candidateName: cfgCandidateName,
        });
      } catch (err) {
        transcriptSummaryError = err instanceof Error ? err.message : "summarization failed";
        console.error("interview-report: transcript summarization failed", err);
      }
    }

    const transcriptTailLines = transcriptLines.slice(-RAW_TAIL_LINES);
    const transcriptTailBlock = transcriptTailLines
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");
    /** Whether the transcript fit entirely in the tail block (so the summary is redundant). */
    const tailCoversAll =
      transcriptLines.length > 0 && transcriptTailLines.length === transcriptLines.length;

    let spokenSection: string;
    if (!hasUsableTranscript(transcriptLines)) {
      spokenSection = "(no spoken transcript captured — use INTERVIEWER SESSION NOTES below for verbal discussion context)";
    } else if (transcriptSummaryText && !tailCoversAll) {
      spokenSection = `### Structured summary (preferred — generated by a dedicated summarization agent over the full transcript):
${transcriptSummaryText}

### Raw transcript tail (last ${transcriptTailLines.length} lines, for direct evidence quoting):
${truncate(transcriptTailBlock, 30_000)}`;
    } else if (transcriptSummaryError) {
      // Summarization failed — fall back to the legacy "last N lines" behavior so the report still works.
      spokenSection = `(summarization unavailable: ${transcriptSummaryError} — falling back to raw transcript tail)
${truncate(transcriptTailBlock, 60_000)}`;
    } else {
      // Transcript was short enough to send verbatim, or the tail already covers all of it.
      spokenSection = truncate(transcriptTailBlock, 60_000);
    }

    const userContent = `You are writing the official post-interview packet for the hiring panel.

Room code: ${roomCode || "(unknown)"}

PARTICIPANTS:
${participantsBlock || "(none)"}

INTERVIEW CONFIG (JSON):
${configStr}

CODING TASK METADATA (the last assigned task definition — same as the final editor context unless no task was open):
${codingStr}

CODING TASK ASSIGNMENT TIMELINE (chronological — each time a **new** shared-editor exercise was opened in the room; use this for the report's **Coding summary** section. The optional \`source\` field distinguishes e.g. take-home preload vs external PRE-TASK vs a normal live assignment):
${codingTaskHistorySanitized.length > 0 ? codingTaskHistoryStr : "(no timeline rows supplied — infer coding work only from chat, transcript, and the single-task metadata above)"}

FINAL CODE FROM THE SHARED IN-ROOM EDITOR (the candidate's actual code at end-of-interview, including any edits made to a pre-loaded take-home submission):
${finalCodeBlock}

FULL TYPED CHAT + AGENT (most recent last, truncated if huge):
${truncate(chatBlock, 70_000)}

INTERVIEWER SESSION NOTES (host's first-person observations and impressions captured during or right after the interview — treat as **primary, first-class evidence**, equal in weight to the spoken transcript when both are present; never treat as fallback-only):
${sessionNotesTrimmed ? truncate(sessionNotesTrimmed, 16_000) : "(none provided)"}

SPOKEN TRANSCRIPT (chronological, may contain STT errors):
${spokenSection}

SPEECH INSIGHT SNIPPETS (interviewer-only per-answer analyses captured live during the session):
${analysisBlock || "(none)"}

EVIDENCE POLICY:
- The **spoken transcript** and the **interviewer session notes** are **complementary**. When both are present, use **both** — they do not cancel each other out and you must not pick one and ignore the other. The transcript captures what was literally said (with possible STT noise); the notes capture the host's interpretation, off-mic discussion, body language cues, and judgement that the recording cannot show. Cross-reference them.
- When only **one** of the two is present, lean on that one and say so once in the executive summary (e.g. "Based on interviewer notes only — no live recording was captured." or "Based on the spoken transcript — no additional interviewer notes were provided.").
- Typed chat, speech-insight snippets, and the coding timeline are supporting evidence; treat them as such, not as substitutes for transcript or notes.

Write a structured **Markdown** report suitable for PDF export. Include:
1. Title with role/difficulty and candidate name if inferable
2. Executive summary (5–8 bullets) — note here which evidence sources were available (transcript / notes / both) so the reader knows what the report is grounded in.
3. **Coding summary** — Use **CODING TASK ASSIGNMENT TIMELINE** above. List every distinct exercise that was opened in the shared editor during this session **in order** (or state clearly if the timeline is empty / not supplied). For **each** entry: title, language, and task type when inferable from \`source\` (e.g. \`pre-interview-task\` = take-home submission pre-loaded, \`external-pre-task\` = pasted external PRE-TASK, omitted = typical live assignment). Summarize what was asked (from the description) and **how the candidate tackled it** — reasoning, approach, struggles, and outcomes — grounded in **chat**, **spoken transcript**, **interviewer session notes**, and **speech insight snippets**. If multiple tasks were used, compare briefly how performance shifted across them. If the timeline has only one row, still write this section in full.
4. **Strengths observed** — base these on **all** available evidence: the structured transcript summary, chat, **and the interviewer session notes**. When both transcript and notes are present, cite at least one observation grounded in the notes and at least one grounded in the transcript whenever possible. Use short verbatim quotes when supported.
5. **Gaps / risks / follow-up questions** — same evidence requirement as Strengths. Notes often surface concerns the transcript will not show (off-mic confusion, hesitation, attitude); do not omit them.
6. **Coding depth (final editor state)** — The **FINAL CODE** block is a snapshot of the **last** active shared coding task only (not every prior exercise). Read it when present and assess: correctness, edge cases handled / missed, complexity, code style, and how the candidate evolved the code during the discussion (chat/transcript/notes may show their reasoning). Quote short snippets when calling out specific issues.
7. Recommended decision hint (hire / no-hire / more rounds) — phrased as guidance for humans, not a command. Reflect both transcript and notes when both informed the decision.
8. Optional: timeline table if useful

LANGUAGE: The transcript / chat may be in Serbian (Cyrillic or Latin), English, or a mix.
**Write the entire report in English regardless of the source language.** When citing a candidate
quote that was not spoken in English, include the original line followed by an English translation
in brackets, e.g. > "Originalna recenica." [English: "Original sentence."]

Tone: professional, concise, fair. Do not invent facts not supported by the materials.
Output **only** Markdown (no JSON wrapper, no code fences around the whole document).`;

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system:
        "You produce interview close-out documentation for internal hiring use only. Output Markdown only. Always write the report in English even if the source materials are in Serbian or another language. Use a clear second-level Markdown heading for the coding summary section (e.g. ## Coding summary).",
      messages: [{ role: "user", content: userContent }],
      temperature: 0.35,
      max_tokens: 7000,
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
