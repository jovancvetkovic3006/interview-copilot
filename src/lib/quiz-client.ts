import type { AsyncQuizDef, AsyncQuizState, QuizSubmission } from "@/types/quiz";

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateQuizCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function quizUrl(code: string): string {
  const proto = PARTYKIT_HOST.startsWith("localhost") || PARTYKIT_HOST.startsWith("127.")
    ? "http"
    : "https";
  return `${proto}://${PARTYKIT_HOST}/parties/quiz/${encodeURIComponent(code.toUpperCase())}`;
}

export class QuizNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Quiz ${code} not found`);
    this.name = "QuizNotFoundError";
  }
}

export async function createAsyncQuiz(input: {
  templateId: string;
  title: string;
  description: string;
  track: string;
  questions: AsyncQuizDef["questions"];
  secondsPerQuestion?: number;
  candidateLabel?: string;
}): Promise<{ code: string; state: AsyncQuizState }> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateQuizCode();
    const res = await fetch(quizUrl(code), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: input.templateId,
        title: input.title,
        description: input.description,
        track: input.track,
        questions: input.questions,
        secondsPerQuestion: input.secondsPerQuestion ?? 180,
        ...(input.candidateLabel ? { candidateLabel: input.candidateLabel } : {}),
      }),
    });
    if (res.status === 201) {
      const state = (await res.json()) as AsyncQuizState;
      return { code, state };
    }
    if (res.status === 409) continue;
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create quiz (${res.status}): ${text}`);
  }
  throw new Error("Could not generate a unique quiz code after several attempts");
}

export async function getAsyncQuiz(code: string): Promise<AsyncQuizState> {
  const res = await fetch(quizUrl(code), { method: "GET", cache: "no-store" });
  if (res.status === 404) throw new QuizNotFoundError(code);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load quiz (${res.status}): ${text}`);
  }
  return (await res.json()) as AsyncQuizState;
}

export async function submitAsyncQuiz(
  code: string,
  payload: { answers: QuizSubmission["answers"]; candidateName?: string }
): Promise<AsyncQuizState> {
  const res = await fetch(quizUrl(code), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submit", ...payload }),
  });
  if (res.status === 404) throw new QuizNotFoundError(code);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to submit quiz (${res.status}): ${text}`);
  }
  return (await res.json()) as AsyncQuizState;
}

export function buildQuizCandidateUrl(code: string): string {
  if (typeof window === "undefined") return `/quiz/${code.toUpperCase()}`;
  return `${window.location.origin}/quiz/${code.toUpperCase()}`;
}

export function buildQuizManageUrl(code: string): string {
  if (typeof window === "undefined") return `/quiz/${code.toUpperCase()}/manage`;
  return `${window.location.origin}/quiz/${code.toUpperCase()}/manage`;
}

export type { AsyncQuizDef, AsyncQuizState };
