import type { PreTaskDef, PreTaskState } from "@/types/pretask";

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

/** Shared room-code alphabet (no ambiguous chars: I/O/0/1). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePreTaskCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function pretaskUrl(code: string): string {
  // PartyKit dev server uses http; in production, NEXT_PUBLIC_PARTYKIT_HOST should be the https hostname.
  const proto = PARTYKIT_HOST.startsWith("localhost") || PARTYKIT_HOST.startsWith("127.")
    ? "http"
    : "https";
  return `${proto}://${PARTYKIT_HOST}/parties/pretask/${encodeURIComponent(code.toUpperCase())}`;
}

export class PreTaskCodeInUseError extends Error {
  constructor(public readonly code: string) {
    super(`Pre-task code ${code} is already in use`);
    this.name = "PreTaskCodeInUseError";
  }
}

export class PreTaskNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Pre-task ${code} not found`);
    this.name = "PreTaskNotFoundError";
  }
}

/**
 * Create a pre-task at the given code. Generates a unique code by retrying on 409 (in-use).
 * Returns the canonical code that was actually claimed.
 */
export async function createPreTask(input: {
  title: string;
  description: string;
  language: string;
  starterCode: string;
  candidateLabel?: string;
}): Promise<{ code: string; state: PreTaskState }> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generatePreTaskCode();
    const res = await fetch(pretaskUrl(code), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        language: input.language,
        starterCode: input.starterCode,
        ...(input.candidateLabel ? { candidateLabel: input.candidateLabel } : {}),
      }),
    });
    if (res.status === 201) {
      const state = (await res.json()) as PreTaskState;
      return { code, state };
    }
    if (res.status === 409) continue; // collision — retry with a fresh code
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create pre-task (${res.status}): ${text}`);
  }
  throw new Error("Could not generate a unique pre-task code after several attempts");
}

export async function getPreTask(code: string): Promise<PreTaskState> {
  const res = await fetch(pretaskUrl(code), { method: "GET", cache: "no-store" });
  if (res.status === 404) throw new PreTaskNotFoundError(code);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load pre-task (${res.status}): ${text}`);
  }
  return (await res.json()) as PreTaskState;
}

export async function submitPreTask(
  code: string,
  payload: { code: string; candidateName?: string }
): Promise<PreTaskState> {
  const res = await fetch(pretaskUrl(code), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submit", ...payload }),
  });
  if (res.status === 404) throw new PreTaskNotFoundError(code);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to submit pre-task (${res.status}): ${text}`);
  }
  return (await res.json()) as PreTaskState;
}

/** Build the candidate-facing share URL (the page they open to solve the task). */
export function buildPreTaskCandidateUrl(code: string): string {
  if (typeof window === "undefined") return `/task/${code.toUpperCase()}`;
  return `${window.location.origin}/task/${code.toUpperCase()}`;
}

/** Build the interviewer-facing manage URL (where the submission shows up). */
export function buildPreTaskManageUrl(code: string): string {
  if (typeof window === "undefined") return `/task/${code.toUpperCase()}/manage`;
  return `${window.location.origin}/task/${code.toUpperCase()}/manage`;
}

export type { PreTaskDef, PreTaskState };
