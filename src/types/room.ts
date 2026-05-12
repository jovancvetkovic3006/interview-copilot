export interface Participant {
  id: string;
  name: string;
  /**
   * Two roles only:
   * - `interviewer`: any host (multiple are allowed; one is the designated host).
   * - `candidate`: the person being interviewed (max one expected per room).
   */
  role: "interviewer" | "candidate";
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  senderName: string;
  timestamp: number;
  /**
   * True when this message arrived from the candidate's voice transcription (debounced final
   * STT segments flushed into chat) instead of being typed. Lets the UI render a mic icon and
   * gives the post-interview report context on whether answers were spoken or written. Always
   * absent on agent replies.
   */
  spoken?: boolean;
}

export interface TranscriptEntry {
  text: string;
  speaker: string;
  timestamp: number;
}

/** Background speech analysis — shared in room state but only shown to interviewer clients. */
export interface TranscriptAnalysisEntry {
  id: string;
  timestamp: number;
  /** Transcript array length after this analysis window (for dedupe / debugging). */
  transcriptEndLength: number;
  summary: string;
  score: number;
  answerQuality: "strong" | "adequate" | "weak" | "insufficient" | "n/a";
  /**
   * Up to ~3 short suggested follow-up questions for the interviewer to ask next, based on what the
   * candidate just said. Empty (or omitted) when the analyzed window had no substantive answer.
   * Always in English regardless of the spoken language.
   */
  followUpQuestions?: string[];
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
  /**
   * Designated host: the first interviewer to join the room.
   * Only this participant is allowed to configure the interview.
   * If the host leaves, the next-longest-present interviewer is promoted (server-managed).
   */
  hostParticipantId: string | null;
  /**
   * Server wall-clock (ms) when the room first entered the `interview` phase — used for scheduled
   * duration + extensions. Null until the first transition to interview.
   */
  interviewStartedAt: number | null;
  /** Extra minutes the host added when the scheduled block ran out (+30 / +60 per action). */
  timeExtensionMinutes: number;
}

export type RoomMessage =
  | { type: "join"; participant: Participant }
  | { type: "leave"; participantId: string }
  | { type: "participants"; participants: Participant[] }
  | { type: "host"; hostParticipantId: string | null }
  | { type: "chat"; message: ChatMessage }
  | { type: "agent-response"; content: string }
  | { type: "config"; config: unknown }
  | {
      type: "phase";
      phase: string;
      interviewStartedAt?: number | null;
      timeExtensionMinutes?: number;
    }
  /** Client → server: host requests more scheduled time (minutes). */
  | { type: "time-extension"; addMinutes: 30 | 60 }
  /** Server → clients: authoritative interview timer fields after phase change or extension. */
  | { type: "interview-time"; interviewStartedAt: number | null; timeExtensionMinutes: number }
  | { type: "coding-task"; task: unknown }
  | { type: "transcript"; text: string; speaker: string; timestamp: number }
  | { type: "transcript-analysis"; analysis: TranscriptAnalysisEntry }
  | { type: "interview-report"; report: InterviewReport }
  | { type: "sync-request" }
  | { type: "sync-response"; state: RoomState };
