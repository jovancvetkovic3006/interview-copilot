import type * as Party from "partykit/server";

/**
 * Async / take-home coding task. One PartyKit room per task code.
 *
 * Persisted in `room.storage` so the task + submission survive worker hibernation:
 *   - "def" → PreTaskDef (immutable once written, prevents code-collision overwrites)
 *   - "submission" → PreTaskSubmission | null (latest only — re-submits replace)
 *
 * HTTP-only (no WebSocket clients). Endpoints:
 *   PUT  /parties/pretask/CODE     body: PreTaskDef                → 201 Created | 409 Conflict
 *   GET  /parties/pretask/CODE                                     → 200 PreTaskState | 404
 *   POST /parties/pretask/CODE     body: { action:"submit", code, candidateName? }
 *                                                                  → 200 PreTaskState | 404
 */

interface PreTaskDef {
  code: string;
  title: string;
  description: string;
  language: string;
  starterCode: string;
  createdAt: number;
  candidateLabel?: string;
}

interface PreTaskSubmission {
  code: string;
  submittedAt: number;
  candidateName?: string;
}

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

export default class PreTaskRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method === "GET") {
      const def = await this.room.storage.get<PreTaskDef>("def");
      if (!def) return jsonResponse({ error: "Not found" }, 404);
      const submission = (await this.room.storage.get<PreTaskSubmission>("submission")) ?? null;
      return jsonResponse({ def, submission });
    }

    if (req.method === "PUT") {
      // Idempotent create: refuse to overwrite an existing task at the same code.
      const existing = await this.room.storage.get<PreTaskDef>("def");
      if (existing) {
        return jsonResponse(
          { error: "Code already in use", def: existing },
          409
        );
      }

      let body: Partial<PreTaskDef>;
      try {
        body = (await req.json()) as Partial<PreTaskDef>;
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();
      const language = String(body.language ?? "").trim();
      const starterCode = String(body.starterCode ?? "");
      if (!title || !language) {
        return jsonResponse({ error: "title and language are required" }, 400);
      }

      const def: PreTaskDef = {
        // Use room id as the canonical code so URL and storage stay in sync.
        code: this.room.id,
        title,
        description,
        language,
        starterCode,
        createdAt: Date.now(),
        ...(body.candidateLabel ? { candidateLabel: String(body.candidateLabel) } : {}),
      };
      await this.room.storage.put("def", def);
      await this.room.storage.put("submission", null);
      return jsonResponse({ def, submission: null }, 201);
    }

    if (req.method === "POST") {
      const def = await this.room.storage.get<PreTaskDef>("def");
      if (!def) return jsonResponse({ error: "Not found" }, 404);

      let body: { action?: string; code?: string; candidateName?: string };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }

      if (body.action !== "submit") {
        return jsonResponse({ error: "Unknown action" }, 400);
      }
      if (typeof body.code !== "string" || body.code.length === 0) {
        return jsonResponse({ error: "code is required" }, 400);
      }

      const submission: PreTaskSubmission = {
        code: body.code,
        submittedAt: Date.now(),
        ...(body.candidateName?.trim() ? { candidateName: body.candidateName.trim() } : {}),
      };
      await this.room.storage.put("submission", submission);
      return jsonResponse({ def, submission });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS });
  }
}

PreTaskRoom satisfies Party.Worker;
