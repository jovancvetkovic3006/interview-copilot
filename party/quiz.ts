import type * as Party from "partykit/server";
import type { AsyncQuizDef, QuizSubmission } from "@/types/quiz";

/**
 * Async standalone quiz. One PartyKit room per quiz code.
 * Persisted in room.storage: "def" → AsyncQuizDef, "submission" → QuizSubmission | null
 */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default class QuizRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method === "GET") {
      const def = await this.room.storage.get<AsyncQuizDef>("def");
      if (!def) return jsonResponse({ error: "Not found" }, 404);
      const submission = (await this.room.storage.get<QuizSubmission>("submission")) ?? null;
      return jsonResponse({ def, submission });
    }

    if (req.method === "PUT") {
      const existing = await this.room.storage.get<AsyncQuizDef>("def");
      if (existing) {
        return jsonResponse({ error: "Code already in use", def: existing }, 409);
      }

      let body: Partial<AsyncQuizDef>;
      try {
        body = (await req.json()) as Partial<AsyncQuizDef>;
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      const title = String(body.title ?? "").trim();
      const templateId = String(body.templateId ?? "").trim();
      const questions = Array.isArray(body.questions) ? body.questions : [];
      if (!title || questions.length === 0) {
        return jsonResponse({ error: "title and questions are required" }, 400);
      }
      if (questions.length > 20) {
        return jsonResponse({ error: "Maximum 20 questions allowed" }, 400);
      }

      const def: AsyncQuizDef = {
        code: this.room.id,
        templateId,
        title,
        description: String(body.description ?? "").trim(),
        track: String(body.track ?? "").trim(),
        questions: questions as AsyncQuizDef["questions"],
        secondsPerQuestion: typeof body.secondsPerQuestion === "number" ? body.secondsPerQuestion : 180,
        createdAt: Date.now(),
        ...(body.candidateLabel ? { candidateLabel: String(body.candidateLabel) } : {}),
      };
      await this.room.storage.put("def", def);
      await this.room.storage.put("submission", null);
      return jsonResponse({ def, submission: null }, 201);
    }

    if (req.method === "POST") {
      const def = await this.room.storage.get<AsyncQuizDef>("def");
      if (!def) return jsonResponse({ error: "Not found" }, 404);

      let body: { action?: string; answers?: QuizSubmission["answers"]; candidateName?: string };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      if (body.action !== "submit") {
        return jsonResponse({ error: "Unknown action" }, 400);
      }
      if (!Array.isArray(body.answers)) {
        return jsonResponse({ error: "answers array is required" }, 400);
      }

      const submission: QuizSubmission = {
        answers: body.answers,
        submittedAt: Date.now(),
        ...(body.candidateName?.trim() ? { candidateName: body.candidateName.trim() } : {}),
      };
      await this.room.storage.put("submission", submission);
      return jsonResponse({ def, submission });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS });
  }
}

QuizRoom satisfies Party.Worker;
