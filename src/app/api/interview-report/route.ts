import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { summarizeTranscript } from "@/lib/summarize-transcript";
import {
  formatQuizBlockForReport,
  sanitizeCodingTaskHistoryForReport,
} from "@/lib/interview-report-context";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";
import {
  buildSpokenSectionForReport,
  formatQuestionScoresForReport,
  shouldSummarizeTranscriptBeforeReport,
} from "@/lib/interview-report-spoken";
import { saveInterviewReportToBlob } from "@/lib/interview-report-blob";
import { buildInterviewReportMeta, normalizeRoomCode } from "@/lib/interview-report-meta";

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
      questionScores,
      quizAnswers,
      activeQuiz,
      quizSubmission,
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
      questionScores?: { question: string; category?: string; score: number; notes?: string }[];
      quizAnswers?: { questionId: string; selectedIndex: number }[];
      activeQuiz?: { title?: string; questions?: { id: string; question: string; correctIndex: number }[] };
      quizSubmission?: {
        answers?: { questionId: string; selectedIndex: number }[];
        candidateName?: string;
      };
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

    const codingTaskHistorySanitized = sanitizeCodingTaskHistoryForReport(
      Array.isArray(codingTaskHistory) ? codingTaskHistory : []
    );
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
      : "(none)";

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

    // Final notes are optional. When transcript is empty, report generation relies on whatever
    // context is available (chat, coding/quiz evidence, optional notes).

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
    if (shouldSummarizeTranscriptBeforeReport(transcriptLines, clientProvidedSummary, TRANSCRIPT_SUMMARY_THRESHOLD)) {
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

    const spokenSection = buildSpokenSectionForReport({
      transcriptLines,
      clientProvidedSummary,
      transcriptSummaryText,
      transcriptSummaryError,
      summaryThreshold: TRANSCRIPT_SUMMARY_THRESHOLD,
      rawTailLines: RAW_TAIL_LINES,
    });

    const questionScoreBlock = formatQuestionScoresForReport(questionScores ?? []);

    const quizBlock = formatQuizBlockForReport({
      activeQuiz: activeQuiz as ActiveQuiz | undefined,
      quizAnswers: quizAnswers as QuizAnswerEntry[] | undefined,
      quizSubmission: quizSubmission as QuizSubmission | undefined,
    });

    const userContent = `You are writing the official post-interview packet for the hiring panel.

Room code: ${roomCode || "(unknown)"}

PARTICIPANTS:
${participantsBlock || "(none)"}

INTERVIEW CONFIG (JSON):
${configStr}

CODING TASK METADATA (the last assigned task definition — same as the final editor context unless no task was open):
${codingStr}

CODING TASK ASSIGNMENT TIMELINE (chronological):
${codingTaskHistorySanitized.length > 0 ? codingTaskHistoryStr : "(none)"}

FINAL CODE FROM THE SHARED IN-ROOM EDITOR (the candidate's actual code at end-of-interview, including any edits made to a pre-loaded take-home submission):
${finalCodeBlock}

FULL TYPED CHAT + AGENT (most recent last, truncated if huge):
${truncate(chatBlock, 70_000)}

INTERVIEWER SESSION NOTES:
${sessionNotesTrimmed ? truncate(sessionNotesTrimmed, 16_000) : "(none)"}

SPOKEN TRANSCRIPT (chronological, may contain STT errors):
${spokenSection}

SPEECH INSIGHT SNIPPETS (interviewer-only per-answer analyses captured live during the session):
${analysisBlock || "(none)"}

MANUAL QUESTION SCORES:
${questionScoreBlock || "(none)"}

LIVE QUIZ RESULTS:
${quizBlock || "(none)"}

Write a concise **Markdown** report for PDF export.

OUTPUT RULES (strict):
- English only. Facts from the materials above only — do not invent.
- When a block above is "(none)", **omit** the matching section entirely. Never mention absent data, limitations, or what you could not assess.
- No meta-commentary, no reasoning about your process, no evidence-source disclaimers.
- Short bullets and sentences. No paragraph longer than two sentences.

Sections (include only when supported by data):
1. **Title** — role, difficulty, candidate name when known
2. **Summary** — 3–5 bullets, outcomes only
3. **Coding** — one bullet per timeline exercise (task + how they did); add a brief note on final code quality only when FINAL CODE is not "(none)"
4. **Quiz** — score + wrong/skipped items only
5. **Verbal scores** — each question with score and one-line note
6. **Strengths** — up to 5 bullets; short quotes when useful
7. **Gaps & follow-ups** — up to 5 bullets; concrete follow-up questions for weak areas
8. **Recommendation** — one line (hire / no-hire / more rounds)

Non-English quotes: original + [English: "…"]. Output Markdown only — no JSON, no wrapper code fence.`;

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system:
        "You write concise post-interview reports for internal hiring use. Markdown only, English only. State only what the provided materials support. Omit sections with no data — never discuss missing inputs or your inference process.",
      messages: [{ role: "user", content: userContent }],
      temperature: 0.35,
      max_tokens: 4000,
    });

    let markdown =
      completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "";
    if (markdown.startsWith("```")) {
      markdown = markdown.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "");
    }
    if (!markdown) {
      return NextResponse.json({ error: "Empty model response" }, { status: 500 });
    }

    const generatedAt = Date.now();
    const code = normalizeRoomCode(String(roomCode ?? ""));
    let stored = false;
    if (code) {
      const meta = buildInterviewReportMeta({
        roomCode: code,
        config: config ?? null,
        participants,
        generatedAt,
      });
      stored = await saveInterviewReportToBlob(code, { markdown, generatedAt }, meta);
    }

    return NextResponse.json({ markdown, generatedAt, stored });
  } catch (error: unknown) {
    console.error("interview-report error:", error);
    let message = "Failed to generate interview report";
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
