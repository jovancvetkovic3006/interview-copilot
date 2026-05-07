import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
  agentInstructions?: string;
  uploadedFiles?: { name: string; type: string; text: string }[];
  notes?: string;
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
  let prompt = `You are an expert technical interviewer conducting an interview for a ${config.difficulty}-level ${config.role} position.

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
    prompt += `

CODING TASKS TO USE (assign these at appropriate moments using the [CODING_TASK] format below):
${config.selectedCodingTasks.map((t) => `- ${t.title} (${t.language}): ${t.description}`).join("\n")}`;
  }

  let codingReviewBehaviorHint = "";
  if (config.codingTaskSubmission) {
    const s = config.codingTaskSubmission;
    const fromInterviewer = s.requestedBy === "interviewer";
    prompt += `

IN-ROOM CODING TASK — REVIEW REQUEST:
${
  fromInterviewer
    ? "The human interviewer shared the candidate's current solution from the live shared editor and asked you to review it. They may send again as the candidate continues to edit."
    : "The candidate asked you to review their current solution (they may submit again while still working on the same task)."
}
Task title: ${s.title}
Language: ${s.language}
Task description:
${s.description}

Their current shared-editor code:
\`\`\`${s.language}
${s.code}
\`\`\``;
    codingReviewBehaviorHint =
      fromInterviewer
        ? `- The interviewer asked you to evaluate the candidate's current in-room solution (see IN-ROOM CODING TASK above). Respond with concise, actionable feedback: what works, issues, complexity, tests/edge cases, and next steps. Address the candidate directly where appropriate. Stay conversational. Do not assign a new [CODING_TASK] unless the candidate has clearly finished this exercise and you are moving on.`
        : `- The candidate just requested feedback on their in-room coding solution (see IN-ROOM CODING TASK above). Respond with concise, actionable feedback: what works, issues, complexity, tests/edge cases, and next steps. Stay conversational. Do not assign a new [CODING_TASK] unless they have clearly finished this exercise and you are moving on.`;
  }

  prompt += `

Your behavior:
- Be professional, friendly, and encouraging
- Ask one question at a time
- Start with introductory/warm-up questions, then progressively increase difficulty
- Mix conceptual questions with practical scenario-based questions
- If uploaded documents were provided, reference specific projects or experience from them
- If a pre-interview coding task was submitted, discuss it early in the interview
- If predefined questions were provided, prioritize asking those
- If predefined coding tasks were provided, use those instead of generating new ones
- When appropriate, assign a coding task using the special format below
- Evaluate responses and provide brief follow-up if needed
- Keep track of the conversation flow naturally
${codingReviewBehaviorHint}

Output formatting (your messages render as Markdown in a chat bubble):
- When a reply has more than one part — e.g. a greeting plus a question, or a code review plus a follow-up — separate them into distinct paragraphs (a blank line between them) so each part is visually clear.
- Use short bold subheadings (\`**Strengths**\`, \`**Suggestions**\`, \`**Next**\`, etc.) when grouping multiple bullet points.
- Use bullet lists (\`- item\`) for enumerations of three or more items; keep prose prose.
- Use fenced code blocks (\`\`\`language) for any multi-line code or shell snippets, and inline backticks for symbol/file/identifier names.
- Keep paragraphs short (1-3 sentences). Avoid walls of text.
- Do NOT prefix every reply with a heading; only use headings when they actually help structure a multi-section answer.

To assign a coding task, include it in your response using this EXACT JSON format on its own line:
[CODING_TASK]{"title":"Task Title","description":"Detailed description of the task","starterCode":"// starter code here","language":"javascript"}[/CODING_TASK]

After code is submitted for review (by the candidate in chat, or by the interviewer using the review action), evaluate it and provide feedback.

When the interview should end (after sufficient questions and at least one coding task), include this marker:
[INTERVIEW_COMPLETE]

Remember to be conversational and natural. Do not number your questions.`;

  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, config, action, codingTaskSubmission } = body;

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

    const systemPrompt = buildSystemPrompt({
      ...config,
      ...(submission ? { codingTaskSubmission: submission } : {}),
    });

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

  const reviewPrompt = `You are reviewing a technical interview for a ${config.difficulty}-level ${config.role} position.
Candidate: ${config.candidateName}

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
