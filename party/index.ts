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
  | {
      type: "phase";
      phase: string;
      interviewStartedAt?: number | null;
      timeExtensionMinutes?: number;
    }
  | { type: "time-extension"; addMinutes: 30 | 60 }
  | { type: "interview-time"; interviewStartedAt: number | null; timeExtensionMinutes: number }
  | { type: "coding-task"; task: unknown }
  | { type: "quiz-start"; quiz: unknown }
  | { type: "activate-coding-task"; collaborationTaskId: string }
  | { type: "activate-quiz"; quizId: string }
  | {
      type: "assignment-state";
      activeAssignment: "none" | "coding" | "quiz";
      codingTask: unknown | null;
      activeQuiz: unknown | null;
      quizAnswers: unknown[];
      quizCandidateStarted: boolean;
      quizSubmission: unknown | null;
      codingTaskHistory: CodingTaskHistoryEntry[];
      quizHistory: QuizHistoryEntry[];
    }
  | { type: "quiz-candidate-started" }
  | { type: "quiz-answer"; answer: unknown }
  | { type: "quiz-complete"; submission: unknown }
  | { type: "question-score"; entry: QuestionScoreEntry }
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
  /**
   * Set by the candidate client when a chat message was produced by flushing a debounced final
   * STT segment (voice-to-chat bridge) instead of being typed. The server is just a passthrough —
   * it doesn't need to validate this; the field rides along on the existing chat broadcast.
   */
  spoken?: boolean;
}

interface InterviewReport {
  markdown: string;
  generatedAt: number;
}

interface QuestionScoreEntry {
  id: string;
  questionId?: string;
  question: string;
  category?: string;
  score: number;
  scoredAt: number;
  scoredBy?: string;
  notes?: string;
}

interface CodingTaskHistoryEntry {
  collaborationTaskId: string;
  task: unknown;
  assignedAt: number;
  title: string;
}

interface QuizHistoryEntry {
  quizId: string;
  quiz: unknown;
  assignedAt: number;
  answers: unknown[];
  quizCandidateStarted: boolean;
  quizSubmission: unknown | null;
}

interface RoomState {
  participants: Participant[];
  messages: ChatMessage[];
  config: unknown | null;
  phase: "setup" | "interview" | "review";
  transcript: { text: string; speaker: string; timestamp: number }[];
  codingTask: unknown | null;
  codingTaskHistory: CodingTaskHistoryEntry[];
  activeQuiz: unknown | null;
  quizHistory: QuizHistoryEntry[];
  activeAssignment: "none" | "coding" | "quiz";
  quizAnswers: unknown[];
  quizCandidateStarted: boolean;
  quizSubmission: unknown | null;
  questionScores: QuestionScoreEntry[];
  transcriptAnalyses: TranscriptAnalysisEntry[];
  interviewReport: InterviewReport | null;
  /** First interviewer to join is the host; only the host can run setup. */
  hostParticipantId: string | null;
  interviewStartedAt: number | null;
  timeExtensionMinutes: number;
}

/** Server-issued id so every client joins the same Yjs sub-room (hashing description caused drift). */
function assignCollaborationTaskId(task: unknown): unknown {
  const collaborationTaskId = crypto.randomUUID();
  if (task !== null && typeof task === "object" && !Array.isArray(task)) {
    return { ...(task as Record<string, unknown>), collaborationTaskId };
  }
  return task;
}

function taskCollaborationId(task: unknown): string | null {
  if (task === null || typeof task !== "object") return null;
  const id = (task as { collaborationTaskId?: string }).collaborationTaskId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function taskTitle(task: unknown): string {
  if (task === null || typeof task !== "object") return "Coding task";
  const t = (task as { title?: string }).title;
  return typeof t === "string" && t.trim() ? t.trim() : "Coding task";
}

function quizIdOf(quiz: unknown): string | null {
  if (quiz === null || typeof quiz !== "object") return null;
  const id = (quiz as { quizId?: string }).quizId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
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
    codingTaskHistory: [],
    activeQuiz: null,
    quizHistory: [],
    activeAssignment: "none",
    quizAnswers: [],
    quizCandidateStarted: false,
    quizSubmission: null,
    questionScores: [],
    transcriptAnalyses: [],
    interviewReport: null,
    hostParticipantId: null,
    interviewStartedAt: null,
    timeExtensionMinutes: 0,
  };

  onConnect(conn: Party.Connection) {
    conn.send(
      JSON.stringify({
        type: "sync-response",
        state: this.state,
      })
    );
  }

  private persistActiveQuizToHistory() {
    const qid = quizIdOf(this.state.activeQuiz);
    if (!qid) return;
    const entry: QuizHistoryEntry = {
      quizId: qid,
      quiz: this.state.activeQuiz,
      assignedAt:
        this.state.quizHistory.find((h) => h.quizId === qid)?.assignedAt ?? Date.now(),
      answers: [...this.state.quizAnswers],
      quizCandidateStarted: this.state.quizCandidateStarted,
      quizSubmission: this.state.quizSubmission,
    };
    const idx = this.state.quizHistory.findIndex((h) => h.quizId === qid);
    if (idx >= 0) this.state.quizHistory[idx] = entry;
    else this.state.quizHistory.push(entry);
  }

  private upsertCodingTaskHistory(task: unknown) {
    const cid = taskCollaborationId(task);
    if (!cid) return;
    const entry: CodingTaskHistoryEntry = {
      collaborationTaskId: cid,
      task,
      assignedAt: Date.now(),
      title: taskTitle(task),
    };
    const idx = this.state.codingTaskHistory.findIndex((h) => h.collaborationTaskId === cid);
    if (idx >= 0) {
      this.state.codingTaskHistory[idx] = {
        ...entry,
        assignedAt: this.state.codingTaskHistory[idx].assignedAt,
      };
    } else {
      this.state.codingTaskHistory.push(entry);
    }
  }

  private syncActiveQuizHistoryFields() {
    const qid = quizIdOf(this.state.activeQuiz);
    if (!qid) return;
    const idx = this.state.quizHistory.findIndex((h) => h.quizId === qid);
    if (idx < 0) return;
    this.state.quizHistory[idx] = {
      ...this.state.quizHistory[idx],
      answers: [...this.state.quizAnswers],
      quizCandidateStarted: this.state.quizCandidateStarted,
      quizSubmission: this.state.quizSubmission,
    };
  }

  private broadcastAssignmentState() {
    this.room.broadcast(
      JSON.stringify({
        type: "assignment-state",
        activeAssignment: this.state.activeAssignment,
        codingTask: this.state.codingTask,
        activeQuiz: this.state.activeQuiz,
        quizAnswers: this.state.quizAnswers,
        quizCandidateStarted: this.state.quizCandidateStarted,
        quizSubmission: this.state.quizSubmission,
        codingTaskHistory: this.state.codingTaskHistory,
        quizHistory: this.state.quizHistory,
      } satisfies RoomMessage)
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
        const raw = typeof data.content === "string" ? data.content : "";
        const stripped = raw.replace(/\[INTERVIEW_COMPLETE\]/gi, "").trimEnd();
        if (!stripped.trim()) break;
        const agentMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: stripped,
          senderName: "AI Agent",
          timestamp: Date.now(),
        };
        this.state.messages.push(agentMsg);
        this.room.broadcast(JSON.stringify({ type: "agent-response", content: stripped } satisfies RoomMessage));
        break;
      }

      case "config": {
        this.state.config = data.config;
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        break;
      }

      case "phase": {
        const next = data.phase as RoomState["phase"];
        if (next === "interview" && this.state.interviewStartedAt == null) {
          this.state.interviewStartedAt = Date.now();
        }
        this.state.phase = next;
        const phasePayload = {
          type: "phase" as const,
          phase: this.state.phase,
          interviewStartedAt: this.state.interviewStartedAt,
          timeExtensionMinutes: this.state.timeExtensionMinutes,
        };
        // Broadcast to everyone (including sender) so the host receives authoritative
        // `interviewStartedAt` from the server.
        this.room.broadcast(JSON.stringify(phasePayload));
        break;
      }

      case "time-extension": {
        if (this.state.phase !== "interview") break;
        const add = data.addMinutes === 60 ? 60 : 30;
        this.state.timeExtensionMinutes += add;
        this.room.broadcast(
          JSON.stringify({
            type: "interview-time",
            interviewStartedAt: this.state.interviewStartedAt,
            timeExtensionMinutes: this.state.timeExtensionMinutes,
          } satisfies RoomMessage)
        );
        break;
      }

      case "coding-task": {
        this.persistActiveQuizToHistory();
        const task = assignCollaborationTaskId(data.task);
        this.upsertCodingTaskHistory(task);
        this.state.codingTask = task;
        this.state.activeAssignment = "coding";
        this.room.broadcast(JSON.stringify({ type: "coding-task", task } satisfies RoomMessage));
        this.broadcastAssignmentState();
        break;
      }

      case "quiz-start": {
        this.persistActiveQuizToHistory();
        const quiz = data.quiz;
        const qid = quizIdOf(quiz);
        this.state.activeQuiz = quiz;
        this.state.quizAnswers = [];
        this.state.quizCandidateStarted = false;
        this.state.quizSubmission = null;
        this.state.activeAssignment = "quiz";
        if (qid) {
          const entry: QuizHistoryEntry = {
            quizId: qid,
            quiz,
            assignedAt: Date.now(),
            answers: [],
            quizCandidateStarted: false,
            quizSubmission: null,
          };
          const idx = this.state.quizHistory.findIndex((h) => h.quizId === qid);
          if (idx >= 0) this.state.quizHistory[idx] = entry;
          else this.state.quizHistory.push(entry);
        }
        this.room.broadcast(JSON.stringify({ type: "quiz-start", quiz } satisfies RoomMessage));
        this.broadcastAssignmentState();
        break;
      }

      case "activate-coding-task": {
        this.persistActiveQuizToHistory();
        const cid = data.collaborationTaskId;
        const entry = this.state.codingTaskHistory.find((h) => h.collaborationTaskId === cid);
        if (!entry) break;
        this.state.codingTask = entry.task;
        this.state.activeAssignment = "coding";
        this.broadcastAssignmentState();
        break;
      }

      case "activate-quiz": {
        this.persistActiveQuizToHistory();
        const entry = this.state.quizHistory.find((h) => h.quizId === data.quizId);
        if (!entry) break;
        this.state.activeQuiz = entry.quiz;
        this.state.quizAnswers = [...entry.answers];
        this.state.quizCandidateStarted = entry.quizCandidateStarted;
        this.state.quizSubmission = entry.quizSubmission;
        this.state.activeAssignment = "quiz";
        this.broadcastAssignmentState();
        break;
      }

      case "quiz-candidate-started": {
        this.state.quizCandidateStarted = true;
        this.syncActiveQuizHistoryFields();
        this.room.broadcast(JSON.stringify({ type: "quiz-candidate-started" } satisfies RoomMessage));
        this.broadcastAssignmentState();
        break;
      }

      case "quiz-answer": {
        const answer = data.answer as { questionId?: string };
        if (answer && typeof answer.questionId === "string") {
          this.state.quizAnswers = this.state.quizAnswers.filter(
            (a) =>
              !(
                a !== null &&
                typeof a === "object" &&
                (a as { questionId?: string }).questionId === answer.questionId
              )
          );
        }
        this.state.quizAnswers.push(data.answer);
        this.state.quizCandidateStarted = true;
        this.syncActiveQuizHistoryFields();
        this.room.broadcast(JSON.stringify(data), [sender.id]);
        this.broadcastAssignmentState();
        break;
      }

      case "quiz-complete": {
        this.state.quizSubmission = data.submission;
        this.state.quizCandidateStarted = true;
        if (
          data.submission &&
          typeof data.submission === "object" &&
          "answers" in data.submission &&
          Array.isArray((data.submission as { answers: unknown[] }).answers)
        ) {
          this.state.quizAnswers = (data.submission as { answers: unknown[] }).answers;
        }
        this.syncActiveQuizHistoryFields();
        this.room.broadcast(JSON.stringify({ type: "quiz-complete", submission: data.submission } satisfies RoomMessage));
        this.broadcastAssignmentState();
        break;
      }

      case "question-score": {
        this.state.questionScores.push(data.entry);
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
