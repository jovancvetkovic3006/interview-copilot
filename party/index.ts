import type * as Party from "partykit/server";

/** Mirrors `TranscriptAnalysisEntry` in src/types/room.ts (kept local for PartyKit bundle). */
interface TranscriptAnalysisEntry {
  id: string;
  timestamp: number;
  transcriptEndLength: number;
  summary: string;
  score: number;
  answerQuality: "strong" | "adequate" | "weak" | "insufficient" | "n/a";
}

// Message types for room communication
export type RoomMessage =
  | { type: "join"; participant: Participant }
  | { type: "leave"; participantId: string }
  | { type: "participants"; participants: Participant[] }
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
  role: "interviewer" | "interviewee" | "observer";
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
}

export default class InterviewRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: RoomState = {
    participants: [],
    messages: [],
    config: null,
    phase: "setup",
    transcript: [],
    codingTask: null,
    transcriptAnalyses: [],
    interviewReport: null,
  };

  onConnect(conn: Party.Connection) {
    // Send current state to the newly connected client
    conn.send(
      JSON.stringify({
        type: "sync-response",
        state: this.state,
      })
    );
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message) as RoomMessage;

    switch (data.type) {
      case "join": {
        // Add participant if not already present
        const exists = this.state.participants.find(
          (p) => p.id === data.participant.id
        );
        if (!exists) {
          this.state.participants.push(data.participant);
        }
        // Broadcast updated participant list to all
        this.room.broadcast(
          JSON.stringify({
            type: "participants",
            participants: this.state.participants,
          })
        );
        break;
      }

      case "leave": {
        this.state.participants = this.state.participants.filter(
          (p) => p.id !== data.participantId
        );
        this.room.broadcast(
          JSON.stringify({
            type: "participants",
            participants: this.state.participants,
          })
        );
        break;
      }

      case "chat": {
        this.state.messages.push(data.message);
        // Broadcast to all except sender
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
        // Broadcast to ALL participants including sender
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
        this.state.codingTask = data.task;
        this.room.broadcast(JSON.stringify(data), [sender.id]);
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
    // Remove participant by connection id
    this.state.participants = this.state.participants.filter(
      (p) => p.id !== conn.id
    );
    this.room.broadcast(
      JSON.stringify({
        type: "participants",
        participants: this.state.participants,
      })
    );
  }

  // HTTP endpoint for creating rooms and getting room info
  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          roomId: this.room.id,
          participants: this.state.participants,
          phase: this.state.phase,
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
