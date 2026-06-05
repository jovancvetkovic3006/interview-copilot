"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import { interviewDurationMinutes, nextTimeExtensionMinutes } from "@/lib/interview-deadline";
import {
  applyInterviewTimerUpdate,
  type InterviewTimerClientState,
} from "@/lib/interview-timer";
import { upsertQuestionScoreEntry } from "@/lib/question-scoring";
import {
  filterChatMessagesForRole,
  resolveIncomingSyncPhase,
  shouldIgnoreSyncPhaseDowngrade,
} from "@/lib/room-sync";
import { transcriptionTrace } from "@/lib/transcription-trace";
import type {
  Participant,
  RoomState,
  RoomMessage,
  ChatMessage,
  TranscriptEntry,
  TranscriptAnalysisEntry,
  InterviewReport,
  QuestionScoreEntry,
  CodingTaskHistoryEntry,
  QuizHistoryEntry,
  ActiveAssignment,
} from "@/types/room";
import type { QuizAnswerEntry, QuizSubmission } from "@/types/quiz";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

export function usePartyRoom(roomId: string | null, participant: Participant | null) {
  const socketRef = useRef<PartySocket | null>(null);
  const participantRoleRef = useRef<Participant["role"] | null>(null);
  const phaseRef = useRef<RoomState["phase"]>("setup");
  const interviewSeenRef = useRef(false);
  const interviewStartedAtRef = useRef<number | null>(null);
  const timeExtensionMinutesRef = useRef(0);
  const interviewEndsAtRef = useRef<number | null>(null);
  const lastTimeExtensionRef = useRef<InterviewTimerClientState["lastTimeExtension"]>(null);
  const configRef = useRef<unknown | null>(null);

  const readTimerState = (): InterviewTimerClientState => ({
    interviewStartedAt: interviewStartedAtRef.current,
    timeExtensionMinutes: timeExtensionMinutesRef.current,
    interviewEndsAt: interviewEndsAtRef.current,
    lastTimeExtension: lastTimeExtensionRef.current,
  });

  const commitTimerState = (next: InterviewTimerClientState) => {
    interviewStartedAtRef.current = next.interviewStartedAt;
    timeExtensionMinutesRef.current = next.timeExtensionMinutes;
    interviewEndsAtRef.current = next.interviewEndsAt;
    lastTimeExtensionRef.current = next.lastTimeExtension;
    setInterviewStartedAt(next.interviewStartedAt);
    setTimeExtensionMinutes(next.timeExtensionMinutes);
    setInterviewEndsAt(next.interviewEndsAt);
    setLastTimeExtension(next.lastTimeExtension);
  };

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [transcriptAnalyses, setTranscriptAnalyses] = useState<TranscriptAnalysisEntry[]>([]);
  const [phase, setPhase] = useState<RoomState["phase"]>("setup");
  const [config, setConfig] = useState<unknown | null>(null);
  const [codingTask, setCodingTask] = useState<unknown | null>(null);
  const [codingTaskHistory, setCodingTaskHistory] = useState<CodingTaskHistoryEntry[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<unknown | null>(null);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryEntry[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<ActiveAssignment>("none");
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswerEntry[]>([]);
  const [quizCandidateStarted, setQuizCandidateStarted] = useState(false);
  const [quizSubmission, setQuizSubmission] = useState<QuizSubmission | null>(null);
  const [questionScores, setQuestionScores] = useState<QuestionScoreEntry[]>([]);
  const [interviewReport, setInterviewReport] = useState<InterviewReport | null>(null);
  const [interviewStartedAt, setInterviewStartedAt] = useState<number | null>(null);
  const [timeExtensionMinutes, setTimeExtensionMinutes] = useState(0);
  /** Authoritative end time from server (keeps candidate countdown in sync with host). */
  const [interviewEndsAt, setInterviewEndsAt] = useState<number | null>(null);
  /** Set when host adds time — drives “interviewer added more time” UI. */
  const [lastTimeExtension, setLastTimeExtension] = useState<{
    at: number;
    minutes: 30 | 60;
  } | null>(null);
  /** First interviewer (server-elected); only the host renders the SetupForm. */
  const [hostParticipantId, setHostParticipantId] = useState<string | null>(null);

  useEffect(() => {
    participantRoleRef.current = participant?.role ?? null;
  }, [participant?.role]);

  useEffect(() => {
    phaseRef.current = "setup";
    interviewSeenRef.current = false;
  }, [roomId]);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "interview" || phase === "review") {
      interviewSeenRef.current = true;
    }
  }, [phase]);

  useEffect(() => {
    interviewStartedAtRef.current = interviewStartedAt;
  }, [interviewStartedAt]);

  useEffect(() => {
    timeExtensionMinutesRef.current = timeExtensionMinutes;
  }, [timeExtensionMinutes]);

  useEffect(() => {
    interviewEndsAtRef.current = interviewEndsAt;
  }, [interviewEndsAt]);

  useEffect(() => {
    lastTimeExtensionRef.current = lastTimeExtension;
  }, [lastTimeExtension]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!roomId || !participant) return;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    });

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      socket.send(
        JSON.stringify({ type: "join", participant } satisfies RoomMessage)
      );
    });

    const applyAssignmentState = (payload: {
      activeAssignment: ActiveAssignment;
      codingTask: unknown | null;
      activeQuiz: unknown | null;
      quizAnswers: unknown[];
      quizCandidateStarted: boolean;
      quizSubmission: unknown | null;
      codingTaskHistory: CodingTaskHistoryEntry[];
      quizHistory: QuizHistoryEntry[];
    }) => {
      setActiveAssignment(payload.activeAssignment);
      setCodingTask(payload.codingTask);
      setActiveQuiz(payload.activeQuiz);
      setQuizAnswers(payload.quizAnswers as QuizAnswerEntry[]);
      setQuizCandidateStarted(payload.quizCandidateStarted);
      setQuizSubmission((payload.quizSubmission as QuizSubmission | null) ?? null);
      setCodingTaskHistory(payload.codingTaskHistory);
      setQuizHistory(payload.quizHistory);
    };

    const applyInterviewTimer = (
      payload: Parameters<typeof applyInterviewTimerUpdate>[1],
      configSnapshot: unknown | null
    ) => {
      commitTimerState(
        applyInterviewTimerUpdate(readTimerState(), payload, configSnapshot, Date.now())
      );
    };

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data) as RoomMessage;

      switch (data.type) {
        case "participants":
          setParticipants(data.participants);
          break;
        case "host":
          setHostParticipantId(data.hostParticipantId);
          break;
        case "chat":
          setMessages((prev) => [...prev, data.message]);
          break;
        case "agent-response":
          if (participantRoleRef.current === "candidate") break;
          setMessages((prev) => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              role: "agent",
              content: data.content,
              senderName: "AI Agent",
              timestamp: Date.now(),
            },
          ]);
          break;
        case "config":
          setConfig(data.config);
          break;
        case "phase": {
          const nextPhase = data.phase as RoomState["phase"];
          if (nextPhase === "interview" || nextPhase === "review") {
            interviewSeenRef.current = true;
          }
          setPhase(nextPhase);
          if ("interviewStartedAt" in data || "timeExtensionMinutes" in data) {
            applyInterviewTimer(data, configRef.current);
          }
          break;
        }
        case "interview-time": {
          applyInterviewTimer(data, configRef.current);
          // Server only emits this during a live interview — always leave the waiting room.
          interviewSeenRef.current = true;
          setPhase((prev) => (prev === "setup" ? "interview" : prev));
          break;
        }
        case "coding-task":
          setCodingTask(data.task);
          interviewSeenRef.current = true;
          setPhase((prev) => (prev === "setup" ? "interview" : prev));
          break;
        case "quiz-start":
          setActiveQuiz(data.quiz);
          interviewSeenRef.current = true;
          setPhase((prev) => (prev === "setup" ? "interview" : prev));
          break;
        case "assignment-state":
          applyAssignmentState(data);
          if (
            data.activeAssignment !== "none" ||
            data.codingTaskHistory.length > 0 ||
            data.quizHistory.length > 0
          ) {
            interviewSeenRef.current = true;
            setPhase((prev) => (prev === "setup" ? "interview" : prev));
          }
          break;
        case "quiz-candidate-started":
          setQuizCandidateStarted(true);
          break;
        case "quiz-answer": {
          const answer = data.answer as QuizAnswerEntry;
          setQuizAnswers((prev) => [
            ...prev.filter((a) => a.questionId !== answer.questionId),
            answer,
          ]);
          setQuizCandidateStarted(true);
          break;
        }
        case "quiz-complete":
          setQuizSubmission(data.submission as QuizSubmission);
          setQuizCandidateStarted(true);
          if (data.submission && typeof data.submission === "object" && "answers" in data.submission) {
            setQuizAnswers((data.submission as QuizSubmission).answers);
          }
          break;
        case "question-score":
          if (participantRoleRef.current !== "interviewer") break;
          setQuestionScores((prev) => upsertQuestionScoreEntry(prev, data.entry));
          break;
        case "transcript": {
          // Live transcript is interviewer-only; candidates still send lines via sendTranscript.
          if (participantRoleRef.current === "candidate") break;
          const preview =
            data.text.length > 120 ? `${data.text.slice(0, 120)}…` : data.text;
          transcriptionTrace("socket ← transcript", {
            speaker: data.speaker,
            chars: data.text.length,
            preview,
            ts: data.timestamp,
          });
          setTranscript((prev) => [
            ...prev,
            {
              text: data.text,
              speaker: data.speaker,
              ...(data.speakerRole ? { speakerRole: data.speakerRole } : {}),
              timestamp: data.timestamp,
            },
          ]);
          break;
        }
        case "transcript-analysis":
          // Only interviewers see speech-analysis insights.
          if (participantRoleRef.current !== "interviewer") break;
          transcriptionTrace("socket ← transcript-analysis", {
            id: data.analysis.id,
            score: data.analysis.score,
            answerQuality: data.analysis.answerQuality,
          });
          setTranscriptAnalyses((prev) => [...prev, data.analysis]);
          break;
        case "interview-report":
          if (participantRoleRef.current !== "interviewer") break;
          setInterviewReport(data.report);
          break;
        case "sync-response": {
          const s = data.state;
          const incomingPhase = s.phase as RoomState["phase"];
          const localPhase = phaseRef.current;

          // Never downgrade an in-progress interview back to setup via reconnect sync.
          // (PartyKit can briefly return a cold/empty snapshot; applying it caused "Waiting to start".)
          if (
            shouldIgnoreSyncPhaseDowngrade({
              interviewSeen: interviewSeenRef.current,
              localPhase,
              incomingPhase,
            })
          ) {
            transcriptionTrace("socket ← sync-response ignored phase downgrade", {
              localPhase,
              incomingPhase,
            });
            setParticipants(s.participants);
            setHostParticipantId(s.hostParticipantId);
            if (typeof s.interviewStartedAt === "number") {
              setInterviewStartedAt(s.interviewStartedAt);
            }
            if (s.config != null) setConfig(s.config);
            applyInterviewTimer(
              {
                interviewStartedAt: s.interviewStartedAt,
                timeExtensionMinutes: s.timeExtensionMinutes,
              },
              s.config
            );
            applyAssignmentState({
              activeAssignment: s.activeAssignment ?? "none",
              codingTask: s.codingTask,
              activeQuiz: s.activeQuiz ?? null,
              quizAnswers: s.quizAnswers ?? [],
              quizCandidateStarted: Boolean(s.quizCandidateStarted),
              quizSubmission: s.quizSubmission ?? null,
              codingTaskHistory: s.codingTaskHistory ?? [],
              quizHistory: s.quizHistory ?? [],
            });
            break;
          }
          transcriptionTrace("socket ← sync-response", {
            participants: data.state.participants.length,
            messages: data.state.messages.length,
            transcriptLines: data.state.transcript.length,
            analyses: (data.state.transcriptAnalyses ?? []).length,
            host: data.state.hostParticipantId,
          });
          setParticipants(data.state.participants);
          setMessages(
            filterChatMessagesForRole(data.state.messages, participantRoleRef.current)
          );
          if (participantRoleRef.current !== "candidate") {
            setTranscript(data.state.transcript);
          }
          {
            const nextPhase = resolveIncomingSyncPhase(incomingPhase, s);
            if (nextPhase !== incomingPhase) {
              transcriptionTrace("sync-response coerced setup → interview", {
                interviewStartedAt: s.interviewStartedAt,
                hasConfig: Boolean(s.config),
                serverPhase: incomingPhase,
              });
            }
            if (nextPhase === "interview" || nextPhase === "review") {
              interviewSeenRef.current = true;
            }
            setPhase(nextPhase);
          }
          setConfig(data.state.config);
          applyAssignmentState({
            activeAssignment: data.state.activeAssignment ?? "none",
            codingTask: data.state.codingTask,
            activeQuiz: data.state.activeQuiz ?? null,
            quizAnswers: data.state.quizAnswers ?? [],
            quizCandidateStarted: Boolean(data.state.quizCandidateStarted),
            quizSubmission: data.state.quizSubmission ?? null,
            codingTaskHistory: data.state.codingTaskHistory ?? [],
            quizHistory: data.state.quizHistory ?? [],
          });
          setHostParticipantId(data.state.hostParticipantId);
          setInterviewStartedAt(
            typeof data.state.interviewStartedAt === "number" ? data.state.interviewStartedAt : null
          );
          applyInterviewTimer(
            {
              interviewStartedAt: data.state.interviewStartedAt,
              timeExtensionMinutes: data.state.timeExtensionMinutes,
            },
            data.state.config
          );
          setTranscriptAnalyses(
            participantRoleRef.current !== "interviewer"
              ? []
              : (data.state.transcriptAnalyses ?? [])
          );
          setQuestionScores(
            participantRoleRef.current !== "interviewer"
              ? []
              : (data.state.questionScores ?? [])
          );
          setInterviewReport(
            participantRoleRef.current !== "interviewer"
              ? null
              : (data.state.interviewReport ?? null)
          );
          break;
        }
      }
    });

    socket.addEventListener("close", () => {
      setConnected(false);
    });

    return () => {
      socket.send(
        JSON.stringify({ type: "leave", participantId: participant.id } satisfies RoomMessage)
      );
      socket.close();
      socketRef.current = null;
    };
  }, [roomId, participant?.id]);

  const sendChat = useCallback((message: ChatMessage) => {
    if (!socketRef.current) return;
    setMessages((prev) => [...prev, message]);
    socketRef.current.send(JSON.stringify({ type: "chat", message } satisfies RoomMessage));
  }, []);

  const sendAgentResponse = useCallback((content: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: "agent-response", content } satisfies RoomMessage));
  }, []);

  const sendConfig = useCallback((cfg: unknown) => {
    if (!socketRef.current) return;
    setConfig(cfg);
    socketRef.current.send(JSON.stringify({ type: "config", config: cfg } satisfies RoomMessage));
  }, []);

  const sendPhase = useCallback((p: string) => {
    if (!socketRef.current) return;
    const nextPhase = p as RoomState["phase"];
    if (nextPhase === "interview" || nextPhase === "review") {
      interviewSeenRef.current = true;
    }
    setPhase(nextPhase);
    socketRef.current.send(JSON.stringify({ type: "phase", phase: p } satisfies RoomMessage));
  }, []);

  const sendCodingTask = useCallback((task: unknown) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: "coding-task", task } satisfies RoomMessage));
  }, []);

  const sendQuizStart = useCallback((quiz: unknown) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: "quiz-start", quiz } satisfies RoomMessage));
  }, []);

  const sendActivateCodingTask = useCallback((collaborationTaskId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({ type: "activate-coding-task", collaborationTaskId } satisfies RoomMessage)
    );
  }, []);

  const sendActivateQuiz = useCallback((quizId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: "activate-quiz", quizId } satisfies RoomMessage));
  }, []);

  const sendQuizAnswer = useCallback((answer: QuizAnswerEntry) => {
    if (!socketRef.current) return;
    setQuizAnswers((prev) => [...prev.filter((a) => a.questionId !== answer.questionId), answer]);
    setQuizCandidateStarted(true);
    socketRef.current.send(JSON.stringify({ type: "quiz-answer", answer } satisfies RoomMessage));
  }, []);

  const sendQuizCandidateStarted = useCallback(() => {
    if (!socketRef.current) return;
    setQuizCandidateStarted(true);
    socketRef.current.send(JSON.stringify({ type: "quiz-candidate-started" } satisfies RoomMessage));
  }, []);

  const sendQuizComplete = useCallback((submission: QuizSubmission) => {
    if (!socketRef.current) return;
    setQuizSubmission(submission);
    setQuizAnswers(submission.answers);
    setQuizCandidateStarted(true);
    socketRef.current.send(JSON.stringify({ type: "quiz-complete", submission } satisfies RoomMessage));
  }, []);

  const sendQuestionScore = useCallback((entry: QuestionScoreEntry) => {
    if (!socketRef.current) return;
    if (participantRoleRef.current !== "interviewer") return;
    setQuestionScores((prev) => upsertQuestionScoreEntry(prev, entry));
    socketRef.current.send(JSON.stringify({ type: "question-score", entry } satisfies RoomMessage));
  }, []);

  const sendTimeExtension = useCallback((addMinutes: 30 | 60) => {
    const now = Date.now();
    const startedAt = interviewStartedAtRef.current;
    const duration = interviewDurationMinutes(configRef.current);
    const nextExt = nextTimeExtensionMinutes(
      startedAt,
      duration,
      timeExtensionMinutesRef.current,
      addMinutes
    );
    commitTimerState(
      applyInterviewTimerUpdate(
        readTimerState(),
        {
          timeExtensionMinutes: nextExt,
          minutesAdded: addMinutes,
        },
        configRef.current,
        now
      )
    );
    if (!socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({ type: "time-extension", addMinutes } satisfies RoomMessage)
    );
  }, []);

  const sendTranscript = useCallback(
    (text: string, speaker: string, speakerRole?: Participant["role"]) => {
    const entry = {
      text,
      speaker,
      timestamp: Date.now(),
      ...(speakerRole ? { speakerRole } : {}),
    };
    const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    transcriptionTrace("sendTranscript (local + optional wire)", {
      speaker,
      chars: text.length,
      preview,
      socketOpen: Boolean(socketRef.current),
    });
    if (participantRoleRef.current !== "candidate") {
      setTranscript((prev) => [...prev, entry]);
    }
    if (!socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({ type: "transcript", ...entry } satisfies RoomMessage)
    );
  },
  []);

  const sendTranscriptAnalysis = useCallback((analysis: TranscriptAnalysisEntry) => {
    if (!socketRef.current) return;
    if (participantRoleRef.current !== "interviewer") return;
    setTranscriptAnalyses((prev) => [...prev, analysis]);
    socketRef.current.send(
      JSON.stringify({ type: "transcript-analysis", analysis } satisfies RoomMessage)
    );
  }, []);

  const sendInterviewReport = useCallback((report: InterviewReport) => {
    setInterviewReport(report);
    if (!socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({ type: "interview-report", report } satisfies RoomMessage)
    );
  }, []);

  return {
    connected,
    participants,
    messages,
    transcript,
    transcriptAnalyses,
    phase,
    config,
    codingTask,
    codingTaskHistory,
    activeQuiz,
    quizHistory,
    activeAssignment,
    quizAnswers,
    quizCandidateStarted,
    quizSubmission,
    questionScores,
    interviewReport,
    interviewStartedAt,
    timeExtensionMinutes,
    interviewEndsAt,
    lastTimeExtension,
    hostParticipantId,
    sendChat,
    sendAgentResponse,
    sendConfig,
    sendPhase,
    sendCodingTask,
    sendActivateCodingTask,
    sendQuizStart,
    sendActivateQuiz,
    sendQuizAnswer,
    sendQuizCandidateStarted,
    sendQuizComplete,
    sendQuestionScore,
    sendTimeExtension,
    sendTranscript,
    sendTranscriptAnalysis,
    sendInterviewReport,
  };
}
