import type * as Party from "partykit/server";

/** Mirrors `TranscriptAnalysisEntry` in src/types/room.ts (kept local for PartyKit bundle). */
interface TranscriptAnalysisEntry {
  id: string;
  timestamp: number;
  transcriptEndLength: number;
  summary: string;
  score: number;
  answerQuality: "strong" | "adequate" | "weak" | "insufficient" | "n/a";
  /** Optional follow-up questions for the interviewer (interviewer-only). */
  followUpQuestions?: string[];
}

export type RoomMessage =
  | { type: "join"; participant: Participant }
  | { type: "leave"; participantId: string }
  | { type: "participants"; participants: Participant[] }
  | { type: "host"; hostParticipantId: string | null }
  | { type: "chat"; message: ChatMessage }
  | { type: "agent-response"; content: string }
  | { type: "config"; config: unknown }
  | { type: "phase"; phase: string }
  | { type: "coding-task"; task: unknown }
  | { type: "transcript"; text: string; speaker: string; timestamp: number }
  | { type: "transcript-analysis"; analysis: TranscriptAnalysisEntry }
  | { type: "interview-report"; report: InterviewReport }
  | { type: "sync-request" }
  | { type: "sync-response"; state: RoomState };

export interface Participant {
  id: string;
  name: string;
  role: "interviewer" | "candidate";
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  senderName: string;
  timestamp: number;
}

interface InterviewReport {
  markdown: string;
  generatedAt: number;
}

interface RoomState {
  participants: Participant[];
  messages: ChatMessage[];
  config: unknown | null;
  phase: "setup" | "interview" | "review";
  transcript: { text: string; speaker: string; timestamp: number }[];
  codingTask: unknown | null;
  transcriptAnalyses: TranscriptAnalysisEntry[];
  interviewReport: InterviewReport | null;
  /** First interviewer to join is the host; only the host can run setup. */
  hostParticipantId: string | null;
}

/** Server-issued id so every client joins the same Yjs sub-room (hashing description caused drift). */
function assignCollaborationTaskId(task: unknown): unknown {
  const collaborationTaskId = crypto.randomUUID();
  if (task !== null && typeof task === "object" && !Array.isArray(task)) {
    return { ...(task as Record<string, unknown>), collaborationTaskId };
  }
  return task;
}

export default class InterviewRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  /** PartyKit connection id → client participant id */
  private connToParticipant = new Map<string, string>();
  /** How many live connections per participant id (multi-tab / reconnect). */
  private participantConnectionCount = new Map<string, number>();

  state: RoomState = {
    participants: [],
    messages: [],
    config: null,
    phase: "setup",
    transcript: [],
    codingTask: null,
    transcriptAnalyses: [],
    interviewReport: null,
    hostParticipantId: null,
  };

  onConnect(conn: Party.Connection) {
    conn.send(
      JSON.stringify({
        type: "sync-response",
        state: this.state,
      })
    );
  }

  private broadcastParticipants() {
    this.room.broadcast(
      JSON.stringify({
        type: "participants",
        participants: this.state.participants,
      })
    );
  }

  private broadcastHost() {
    this.room.broadcast(
      JSON.stringify({
        type: "host",
        hostParticipantId: this.state.hostParticipantId,
      })
    );
  }

  /** Pick the longest-present interviewer as the new host (or null if none remain). */
  private pickReplacementHost(): string | null {
    const interviewers = this.state.participants
      .filter((p) => p.role === "interviewer")
      .sort((a, b) => a.joinedAt - b.joinedAt);
    return interviewers[0]?.id ?? null;
  }

  /** Tear down one socket's presence; remove participant only when their last connection drops. */
  private disconnectConnection(connId: string) {
    const participantId = this.connToParticipant.get(connId);
    if (!participantId) return;
    this.connToParticipant.delete(connId);
    const prev = this.participantConnectionCount.get(participantId) ?? 1;
    const next = prev - 1;
    if (next > 0) {
      this.participantConnectionCount.set(participantId, next);
      return; // still has live tabs — keep them in the roster.
    }

    this.participantConnectionCount.delete(participantId);
    const wasHost = this.state.hostParticipantId === participantId;
    this.state.participants = this.state.participants.filter((p) => p.id !== participantId);
    if (wasHost) {
      this.state.hostParticipantId = this.pickReplacementHost();
      this.broadcastHost();
    }
    this.broadcastParticipants();
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message) as RoomMessage;

    switch (data.type) {
      case "join": {
        const p = data.participant;

        // Same connection re-sends `join` (e.g. fast remount): just update the participant record.
        if (this.connToParticipant.get(sender.id) === p.id) {
          const idx = this.state.participants.findIndex((x) => x.id === p.id);
          if (idx >= 0) {
            this.state.participants[idx] = {
              ...p,
              joinedAt: this.state.participants[idx].joinedAt,
            };
          }
          this.broadcastParticipants();
          break;
        }

        const idx = this.state.participants.findIndex((x) => x.id === p.id);
        if (idx >= 0) {
          this.state.participants[idx] = {
            ...p,
            joinedAt: this.state.participants[idx].joinedAt,
          };
        } else {
          this.state.participants.push(p);
        }
        this.connToParticipant.set(sender.id, p.id);
        this.participantConnectionCount.set(
          p.id,
          (this.participantConnectionCount.get(p.id) ?? 0) + 1
        );

        // First interviewer in the room becomes the host (sticky until they fully leave).
        if (
          p.role === "interviewer" &&
          (this.state.hostParticipantId === null ||
            !this.state.participants.some((x) => x.id === this.state.hostParticipantId))
        ) {
          this.state.hostParticipantId = p.id;
          this.broadcastHost();
        }

        this.broadcastParticipants();
        break;
      }

      case "leave": {
        if (this.connToParticipant.has(sender.id)) {
          this.disconnectConnection(sender.id);
        } else if (data.participantId) {
          const wasHost = this.state.hostParticipantId === data.participantId;
          this.state.participants = this.state.participants.filter(
            (x) => x.id !== data.participantId
          );
          this.participantConnectionCount.delete(data.participantId);
          if (wasHost) {
            this.state.hostParticipantId = this.pickReplacementHost();
            this.broadcastHost();
          }
          this.broadcastParticipants();
        }
        break;
      }

      case "chat": {
        this.state.messages.push(data.message);
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        break;
      }

      case "agent-response": {
        const agentMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: data.content,
          senderName: "AI Agent",
          timestamp: Date.now(),
        };
        this.state.messages.push(agentMsg);
        this.room.broadcast(JSON.stringify(data));
        break;
      }

      case "config": {
        this.state.config = data.config;
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        break;
      }

      case "phase": {
        this.state.phase = data.phase as RoomState["phase"];
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        break;
      }

      case "coding-task": {
        const task = assignCollaborationTaskId(data.task);
        this.state.codingTask = task;
        // Include the sender so their client gets the same `collaborationTaskId` as everyone else
        // (otherwise interviewer and candidate would use different Yjs room names).
        this.room.broadcast(JSON.stringify({ type: "coding-task", task } satisfies RoomMessage));
        break;
      }

      case "transcript": {
        this.state.transcript.push({
          text: data.text,
          speaker: data.speaker,
          timestamp: data.timestamp,
        });
        const preview =
          data.text.length > 100 ? `${data.text.slice(0, 100)}…` : data.text;
        console.log(
          `[transcription/party] transcript speaker=${data.speaker} chars=${data.text.length} lines=${this.state.transcript.length} preview=${JSON.stringify(preview)}`
        );
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        break;
      }

      case "transcript-analysis": {
        this.state.transcriptAnalyses.push(data.analysis);
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        break;
      }

      case "interview-report": {
        this.state.interviewReport = data.report;
        this.room.broadcast(JSON.stringify(data));
        break;
      }

      case "sync-request": {
        sender.send(
          JSON.stringify({
            type: "sync-response",
            state: this.state,
          })
        );
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    if (this.connToParticipant.has(conn.id)) {
      this.disconnectConnection(conn.id);
    }
  }

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          roomId: this.room.id,
          participants: this.state.participants,
          phase: this.state.phase,
          hostParticipantId: this.state.hostParticipantId,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

InterviewRoom satisfies Party.Worker;
