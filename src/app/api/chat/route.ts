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
  intervieweeName: string;
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
}) {
  let prompt = `You are an expert technical interviewer conducting an interview for a ${config.difficulty}-level ${config.role} position.

The interviewee's name is ${config.intervieweeName}.

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

Review this code during the interview. Ask the candidate about their approach, design decisions, and potential improvements.`;
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

To assign a coding task, include it in your response using this EXACT JSON format on its own line:
[CODING_TASK]{"title":"Task Title","description":"Detailed description of the task","starterCode":"// starter code here","language":"javascript"}[/CODING_TASK]

After the interviewee submits code, review it and provide feedback.

When the interview should end (after sufficient questions and at least one coding task), include this marker:
[INTERVIEW_COMPLETE]

Remember to be conversational and natural. Do not number your questions.`;

  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, config, action } = body;

    if (action === "generate-review") {
      return generateReview(body);
    }

    const systemPrompt = buildSystemPrompt(config);

    const claudeMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const client = getAnthropicClient();
    const completion = await createMessageWithFallback(client, {
      system: systemPrompt,
      messages: claudeMessages,
      temperature: 0.7,
      max_tokens: 1500,
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
    intervieweeName: string;
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
        `${m.role === "agent" ? "Interviewer" : config.intervieweeName}: ${m.content}`
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
Interviewee: ${config.intervieweeName}

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
