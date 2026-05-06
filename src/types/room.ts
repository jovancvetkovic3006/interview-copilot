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

export interface TranscriptEntry {
  text: string;
  speaker: string;
  timestamp: number;
}

export interface RoomState {
  participants: Participant[];
  messages: ChatMessage[];
  config: unknown | null;
  phase: "setup" | "interview" | "review";
  transcript: TranscriptEntry[];
  codingTask: unknown | null;
}

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
  | { type: "sync-request" }
  | { type: "sync-response"; state: RoomState };
