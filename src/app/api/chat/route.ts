import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { formatManualQuestionScoresPromptSection } from "@/lib/chat-prompt-sections";
import { appendCodingReviewToSystemPrompt } from "@/lib/chat-coding-prompt";
import { appendLiveQuizToSystemPrompt } from "@/lib/chat-quiz-prompt";
import { formatInterviewRoleLabel, isMultiRoleInterview, resolveInterviewRoles } from "@/lib/interview-roles";
import type { LiveQuizAgentContext } from "@/lib/quiz-summary";

// Model fallback chain — tries each model in order until one works
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
      // Only retry on 404 (model not found), throw on other errors
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
        console.warn(`Model ${model} not found, trying next...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function buildSystemPrompt(config: {
  role: string;
  difficulty: string;
  topics: string[];
  candidateName: string;
  /** Private interviewer-assistant mode for collaborative room. */
  collaborativeRoom?: boolean;
  agentInstructions?: string;
  uploadedFiles?: { name: string; type: string; text: string }[];
  notes?: string;
  transcriptInsights?: {
    summary: string;
    answerQuality: string;
    score: number;
    followUpQuestions?: string[];
  }[];
  /** Recent live transcript lines from all participants (candidate + interviewers). */
  recentTranscript?: { speaker: string; role: string; text: string }[];
  /** All live quizzes assigned this session (including earlier ones revisited from history). */
  liveQuizHistory?: LiveQuizAgentContext[];
  /** Live in-room quiz currently selected in the UI (may be in progress). */
  liveQuizContext?: LiveQuizAgentContext;
  recentQuestionScores?: {
    question: string;
    score: number;
    scoreLabel?: string;
    category?: string;
    scoredAt?: number;
  }[];
  preInterviewTask?: {
    title: string;
    description: string;
    language: string;
    starterCode?: string;
    submittedCode?: string;
  };
  selectedQuestions?: { question: string; category: string }[];
  selectedCodingTasks?: {
    title: string;
    description: string;
    starterCode: string;
    language: string;
    /**
     * When true, this is an external PRE-TASK pasted at setup time: the candidate already
     * solved it on another platform and `starterCode` carries their solution. The interviewer
     * can open it in the shared editor for live discussion — do NOT assign a fresh blank version.
     */
    preTask?: boolean;
  }[];
  /** Shared live-editor snapshot for AI feedback (may repeat while still on the same task). */
  codingTaskSubmission?: {
    title: string;
    description: string;
    language: string;
    code: string;
    /** Who triggered the review (default candidate for older clients). */
    requestedBy?: "interviewer" | "candidate";
  };
}) {
  const interviewRoles = resolveInterviewRoles(config);
  const roleLabel = formatInterviewRoleLabel(interviewRoles);
  const multiRole = isMultiRoleInterview(config);

  let prompt = multiRole
    ? `You are an interviewer assistant helping a human interviewer run a ${config.difficulty}-level interview covering multiple role areas: ${roleLabel}.

Balance questions and coding tasks across these areas: ${interviewRoles.join(", ")}.`
    : `You are an interviewer assistant helping a human interviewer run a ${config.difficulty}-level ${roleLabel} interview.`;

  prompt += `

The candidate's name is ${config.candidateName}.

Topics to cover: ${config.topics.join(", ")}.`;

  if (config.agentInstructions) {
    prompt += `

INTERVIEWER INSTRUCTIONS (follow these closely):
${config.agentInstructions}`;
  }

  if (config.uploadedFiles && config.uploadedFiles.length > 0) {
    for (const file of config.uploadedFiles) {
      const label =
        file.type === "cv"
          ? "CANDIDATE CV/RESUME"
          : file.type === "bio"
            ? "CANDIDATE BIOGRAPHY"
            : `UPLOADED DOCUMENT (${file.name})`;
      prompt += `

${label}:
${file.text}`;
    }
  }

  if (config.notes) {
    prompt += `

NOTES ABOUT CANDIDATE:
${config.notes}`;
  }

  if (config.recentTranscript && config.recentTranscript.length > 0) {
    prompt += `

RECENT LIVE TRANSCRIPT (all participants — candidate and interviewers; may contain STT errors):
${config.recentTranscript
  .slice(-80)
  .map((line) => `[${line.role}] ${line.speaker}: ${line.text}`)
  .join("\n")}`;
  }

  if (config.transcriptInsights && config.transcriptInsights.length > 0) {
    prompt += `

LIVE TRANSCRIPT INSIGHTS (latest speech-analysis summaries; use these to guide follow-ups):
${config.transcriptInsights
  .slice(-8)
  .map(
    (i, idx) =>
      `${idx + 1}. [${i.answerQuality}, ${i.score}/10] ${i.summary}${
        i.followUpQuestions?.length
          ? `\n   Suggested follow-ups: ${i.followUpQuestions.join(" | ")}`
          : ""
      }`
  )
  .join("\n")}`;
  }

  if (config.recentQuestionScores && config.recentQuestionScores.length > 0) {
    prompt += formatManualQuestionScoresPromptSection(config.recentQuestionScores);
  }

  const quizAppend = appendLiveQuizToSystemPrompt(prompt, {
    liveQuizHistory: config.liveQuizHistory,
    liveQuizContext: config.liveQuizContext,
  });
  prompt = quizAppend.prompt;
  const quizReviewBehaviorHint = quizAppend.includesReviewHints
    ? `- When the interviewer asks about the quiz (or quiz data is relevant), summarize performance, weak topics, and patterns (speed, skipped questions).
- Suggest 3-5 concrete verbal follow-up questions to probe wrong answers or validate strengths — reference specific quiz questions when useful.
- If status is "in-progress", treat partial results as provisional and note what is still unanswered.
- Do not reveal correct answers to the candidate; you are advising the interviewer only.`
    : "";

  if (config.preInterviewTask) {
    prompt += `

PRE-INTERVIEW CODING TASK:
The candidate was given a coding task before the interview.
Task: ${config.preInterviewTask.title}
Description: ${config.preInterviewTask.description}
Language: ${config.preInterviewTask.language}`;
    if (config.preInterviewTask.submittedCode) {
      prompt += `
Submitted Code:
${config.preInterviewTask.submittedCode}

This submitted code is ALREADY PRE-LOADED in the shared collaborative editor — both you and the candidate can see it. Do NOT assign a new [CODING_TASK] for this; the editor is already on it. Open the interview by walking the candidate through their solution: ask about their approach, design decisions, edge cases they considered, and potential improvements.`;
    }
  }

  if (config.selectedQuestions && config.selectedQuestions.length > 0) {
    prompt += `

QUESTIONS TO ASK (weave these into the conversation naturally, you don't have to ask all of them):
${config.selectedQuestions.map((q, i) => `${i + 1}. [${q.category}] ${q.question}`).join("\n")}`;
  }

  if (config.selectedCodingTasks && config.selectedCodingTasks.length > 0) {
    const preTasks = config.selectedCodingTasks.filter((t) => t.preTask);
    const regularTasks = config.selectedCodingTasks.filter((t) => !t.preTask);

    if (preTasks.length > 0) {
      prompt += `

EXTERNAL PRE-TASKS (candidate already solved these on another platform — HackerRank, CodeSignal, etc.):
${preTasks
  .map(
    (t) => `- ${t.title} (${t.language})
  Task: ${t.description || "(no description provided)"}
  Candidate's solution:
${t.starterCode
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}`
  )
  .join("\n\n")}

The interviewer may "Open" any PRE-TASK during the interview, which loads the candidate's solution into the shared editor for live discussion. When that happens, do NOT assign a fresh blank [CODING_TASK] for it — instead, walk the candidate through their submitted code: probe their approach, design decisions, edge-case handling, complexity, and potential improvements.`;
    }

    if (regularTasks.length > 0) {
      prompt += `

CODING TASKS TO USE (assign these at appropriate moments using the [CODING_TASK] format below):
${regularTasks.map((t) => `- ${t.title} (${t.language}): ${t.description}`).join("\n")}`;
    }
  }

  let codingReviewBehaviorHint = "";
  if (config.codingTaskSubmission) {
    const codingAppend = appendCodingReviewToSystemPrompt(prompt, config.codingTaskSubmission);
    prompt = codingAppend.prompt;
    codingReviewBehaviorHint = codingAppend.reviewHint;
  }

  prompt += `

Your role and behavior:
- You are talking to the interviewer only (private assistant), never to the candidate.
- Be proactive: suggest what to ask next and why.
- Offer 2-4 concise follow-up questions based on the latest transcript insights and recent live transcript.
- Keep track of interview direction across topics and scored questions.
- Use the recent live transcript (all speakers), transcript insights, manual scores, coding reviews, quiz outcomes, CV/bio, and pre-task context.
- If coding-task review context is provided, focus on assessment quality, risks, and concrete next probes.
- Do not claim to have directly observed non-textual behavior (body language, tone confidence, etc.) unless explicitly present in provided data.
- Do not emit [INTERVIEW_COMPLETE] or similar control markers.
${codingReviewBehaviorHint}
${quizReviewBehaviorHint}

Output format (for interviewer assistant panel):
- Keep responses concise and actionable.
- Prefer sections like **Next best question**, **Follow-ups**, **Scoring hint**, **Quiz summary**, **What to probe**.
- Provide clickable-style short question options (single-sentence) the interviewer can ask verbatim.
- Keep paragraphs short (1-3 sentences).
- Do not number every reply unless ranking options helps.`;

  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, config, action, codingTaskSubmission, promptHint } = body;

    if (action === "generate-review") {
      return generateReview(body);
    }

    const submission =
      codingTaskSubmission &&
      typeof codingTaskSubmission.title === "string" &&
      typeof codingTaskSubmission.code === "string"
        ? {
            title: codingTaskSubmission.title,
            description: String(codingTaskSubmission.description ?? ""),
            language: String(codingTaskSubmission.language ?? "javascript"),
            code: codingTaskSubmission.code,
            requestedBy:
              codingTaskSubmission.requestedBy === "interviewer"
                ? ("interviewer" as const)
                : ("candidate" as const),
          }
        : undefined;

    let systemPrompt = buildSystemPrompt({
      ...config,
      ...(submission ? { codingTaskSubmission: submission } : {}),
    });
    if (typeof promptHint === "string" && promptHint.trim()) {
      systemPrompt += `\n\nADDITIONAL INSTRUCTION FOR THIS TURN:\n${promptHint.trim()}`;
    }

    const claudeMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system: systemPrompt,
      messages: claudeMessages,
      temperature: 0.7,
      max_tokens: submission ? 2800 : 1500,
    });

    const responseContent = completion.content[0]?.type === "text" ? completion.content[0].text : "";

    return NextResponse.json({ content: responseContent });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    let message = "Failed to process request";
    if (error instanceof Error) {
      message = error.message;
    }
    // Surface Anthropic SDK error details
    if (error && typeof error === "object" && "status" in error) {
      const apiErr = error as { status: number; message?: string; error?: { message?: string } };
      message = `${apiErr.status}: ${apiErr.error?.message || apiErr.message || message}`;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function generateReview(body: {
  messages: { role: string; content: string }[];
  config: {
    role: string;
    difficulty: string;
    topics: string[];
    candidateName: string;
    reviewTemplate?: { categories: string[] };
  };
  codingTasks: { title: string; submittedCode?: string; description: string }[];
  notes: { category: string; content: string }[];
  transcript?: { text: string; speaker: string; timestamp: number }[];
}) {
  const { messages, config, codingTasks, notes, transcript } = body;

  const conversationSummary = messages
    .map(
      (m: { role: string; content: string }) =>
        `${m.role === "agent" ? "Interviewer" : config.candidateName}: ${m.content}`
    )
    .join("\n");

  const codingTasksSummary = codingTasks
    .map(
      (t: { title: string; submittedCode?: string; description: string }) =>
        `Task: ${t.title}\nDescription: ${t.description}\nSubmitted Code:\n${t.submittedCode || "Not submitted"}`
    )
    .join("\n\n");

  const notesSummary = notes
    .map((n: { category: string; content: string }) => `[${n.category}] ${n.content}`)
    .join("\n");

  const categories = config.reviewTemplate?.categories ?? [
    "Technical Knowledge",
    "Problem Solving",
    "Code Quality",
    "Communication",
    "System Design Thinking",
  ];

  const scoresJson = categories
    .map((cat) => `    {"category": "${cat}", "score": <1-10>, "comment": "<comment>"}`)
    .join(",\n");

  const transcriptSummary = transcript && transcript.length > 0
    ? transcript.map((t) => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.speaker}: ${t.text}`).join("\n")
    : "";

  const reviewRoles = resolveInterviewRoles(config);
  const reviewRoleLabel = formatInterviewRoleLabel(reviewRoles);
  const reviewMultiRole = reviewRoles.length > 1;

  const reviewPrompt = `You are reviewing a technical interview for a ${config.difficulty}-level ${reviewMultiRole ? `combined position (${reviewRoleLabel})` : `${reviewRoleLabel} position`}.
${reviewMultiRole ? `Assess the candidate across: ${reviewRoles.join(", ")}.\n` : ""}Candidate: ${config.candidateName}

FULL CONVERSATION:
${conversationSummary}
${transcriptSummary ? `\nAUDIO TRANSCRIPT (spoken during the interview):\n${transcriptSummary}\n` : ""}
CODING TASKS:
${codingTasksSummary}

INTERVIEWER NOTES:
${notesSummary}

Please provide a comprehensive review in the following JSON format:
{
  "overallScore": <number 1-10>,
  "summary": "<2-3 paragraph summary>",
  "scores": [
${scoresJson}
  ],
  "strengths": ["<strength1>", "<strength2>", ...],
  "weaknesses": ["<weakness1>", "<weakness2>", ...],
  "recommendation": "<one of: strong-hire, hire, maybe, no-hire>",
  "detailedNotes": "<detailed markdown notes about the interview>"
}

Return ONLY valid JSON, no markdown formatting.`;

  const client = getAnthropicClient();
  const completion = await createMessageWithFallback(client, {
    system: reviewPrompt,
    messages: [{ role: "user", content: "Please generate the interview review now." }],
    temperature: 0.3,
    max_tokens: 3000,
  });

  const content = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";

  try {
    const review = JSON.parse(content);
    return NextResponse.json({ review });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse review response" },
      { status: 500 }
    );
  }
}
