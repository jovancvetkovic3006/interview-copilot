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

/** Background speech analysis — shared in room state but only shown to interviewer & observer clients. */
export interface TranscriptAnalysisEntry {
  id: string;
  timestamp: number;
  /** Transcript array length after this analysis window (for dedupe / debugging). */
  transcriptEndLength: number;
  summary: string;
  score: number;
  answerQuality: "strong" | "adequate" | "weak" | "insufficient" | "n/a";
}

/** Post-interview summary generated once per room (shared via PartyKit). */
export interface InterviewReport {
  markdown: string;
  generatedAt: number;
}

export interface RoomState {
  participants: Participant[];
  messages: ChatMessage[];
  config: unknown | null;
  phase: "setup" | "interview" | "review";
  transcript: TranscriptEntry[];
  codingTask: unknown | null;
  transcriptAnalyses: TranscriptAnalysisEntry[];
  interviewReport: InterviewReport | null;
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
  | { type: "transcript-analysis"; analysis: TranscriptAnalysisEntry }
  | { type: "interview-report"; report: InterviewReport }
  | { type: "sync-request" }
  | { type: "sync-response"; state: RoomState };
