"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { usePartyRoom } from "@/hooks/use-party-room";
import { useSpeechTranscription } from "@/hooks/use-speech-transcription";
import type { InterviewReport, Participant, QuestionScoreEntry } from "@/types/room";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";
import type {
  CodingTaskAssignmentSnapshot,
  CodingTaskPreset,
  InterviewConfig,
  PredefinedQuestion,
} from "@/types/interview";
import { PREDEFINED_QUESTIONS, CODING_TASK_PRESETS } from "@/data/presets";
import { QUIZ_TEMPLATES, DEFAULT_SECONDS_PER_QUESTION } from "@/data/quiz-templates";
import {
  buildCodingTaskGroupsForRoles,
  buildQuestionGroupsForRoles,
  filterGroupsByQuery,
  flattenGroups,
  questionSearchableText,
  taskSearchableText,
} from "@/data/preset-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollaborativeEditor, type CollaborativeEditorHandle } from "@/components/collaborative-editor";
import { SetupForm } from "@/components/setup-form";
import { InterviewReviewPanel } from "@/components/interview-review";
import { AgentMessage } from "@/components/agent-message";
import { CvSuggestionsPanel } from "@/components/cv-suggestions-panel";
import { InterviewAssistantColumns } from "@/components/interview-assistant-columns";
import { QaFloatingDrawer } from "@/components/qa-floating-drawer";
import { LiveQuizPanel } from "@/components/live-quiz-panel";
import { QuizResultsSummary } from "@/components/quiz-results-summary";
import { AssignmentHistoryStrip } from "@/components/assignment-history-strip";
import { QuestionScorePrompt } from "@/components/question-score-prompt";
import { QuestionScoresPanel } from "@/components/question-scores-panel";
import {
  findQuestionScoreIndex,
  formatQuestionScoreChatLine,
  scoreLevelShortLabel,
} from "@/lib/question-scoring";
import {
  buildRecentQuestionScoresForAgent,
  buildTranscriptInsightsForAgent,
} from "@/lib/agent-room-config";
import { buildLiveQuizAgentPayload } from "@/lib/room-assignment";
import { buildLiveQuizAgentContext } from "@/lib/quiz-summary";
import {
  buildTranscriptAnalysisWindow,
  normalizeTranscriptAnalysisResponse,
  shouldScheduleTranscriptAnalysis,
  transcriptWindowReadyForApi,
  TRANSCRIPT_ANALYSIS_DEBOUNCE_MS,
} from "@/lib/transcript-analysis";
import {
  buildRoomInviteUrl as buildRoomInviteUrlFromOrigin,
  formatRemainingMs,
  inviteRoleLabel,
} from "@/lib/room-invite";
import { deriveInterviewTimerDisplay } from "@/lib/interview-timer";
import { formatInterviewRoleLabel, resolveInterviewRoles } from "@/lib/interview-roles";
import { hasUsableTranscript } from "@/lib/interview-report-gate";
import { loadInterviewReport, saveInterviewReport } from "@/lib/interview-report-storage";
import {
  resolveSpeechRecognitionLanguage,
  speechLanguageDisplayLabel,
} from "@/lib/speech-recognition-language";
import { resolveTranscriptSpeakerLabel } from "@/lib/transcript-speaker";
import { resolveActiveStep, sessionIsLive, type RoomUiStep } from "@/lib/room-step";
import {
  Users,
  Wifi,
  WifiOff,
  Copy,
  Check,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  Clock,
  Code2,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Sparkles,
  StopCircle,
  FileSearch,
  Pin,
} from "lucide-react";

const MIN_FINAL_NOTES_CHARS_HINT = 30;

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

const PARTICIPANT_ID_STORAGE_PREFIX = "interview-copilot:participant:";

/** Stable id per browser tab session for this room + role so refresh/reconnect does not duplicate roster entries. */
function getOrCreateParticipantId(roomCode: string, role: Participant["role"]): string {
  const key = `${PARTICIPANT_ID_STORAGE_PREFIX}${roomCode}:${role}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing && existing.length >= 6 && existing.length <= 48) return existing;
  } catch {
    /* private mode / SSR */
  }
  const id = generateId();
  try {
    sessionStorage.setItem(key, id);
  } catch {
    /* ignore */
  }
  return id;
}

function buildRoomInviteUrl(roomCode: string, role: Participant["role"]): string {
  if (typeof window === "undefined") return "";
  return buildRoomInviteUrlFromOrigin(window.location.origin, roomCode, role);
}

type Step = RoomUiStep;
type InviteCopyKind = "candidate" | "interviewer";

export interface RoomPageClientProps {
  /** Room code from the URL (case-normalized to uppercase by the page wrapper). */
  roomCode: string;
  /** Role derived from the route: `/interview/CODE` → interviewer, `/invite/CODE` → candidate. */
  inviteRole: Participant["role"];
}

export function RoomPageClient({ roomCode, inviteRole }: RoomPageClientProps) {
  const [step, setStep] = useState<Step>("join");

  const [name, setName] = useState("");
  const [inviteCopied, setInviteCopied] = useState<InviteCopyKind | null>(null);
  const [inviteDropdownOpen, setInviteDropdownOpen] = useState(false);
  const inviteDropdownRef = useRef<HTMLDivElement>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [showTasksPanel, setShowTasksPanel] = useState(false);
  const [expandedSection, setExpandedSection] = useState<"questions" | "tasks" | "quiz" | "cv" | null>(null);
  const sidebarSectionsInitRef = useRef(false);
  const qaPanelRef = useRef<HTMLDivElement>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [endInterviewModalOpen, setEndInterviewModalOpen] = useState(false);
  const [endInterviewNotes, setEndInterviewNotes] = useState("");
  const [pendingScoreQuestion, setPendingScoreQuestion] = useState<{
    question: string;
    questionId?: string;
    category?: string;
  } | null>(null);
  const finalNotesStorageKey = `ic-final-review-notes-${roomCode}`;
  const [sessionReviewNotes, setSessionReviewNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setSessionReviewNotes(sessionStorage.getItem(finalNotesStorageKey) ?? "");
      } catch {
        setSessionReviewNotes("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [finalNotesStorageKey]);

  const setSessionReviewNotesPersisted = useCallback(
    (v: string) => {
      setSessionReviewNotes(v);
      try {
        sessionStorage.setItem(finalNotesStorageKey, v);
      } catch {
        /* ignore quota / private mode */
      }
    },
    [finalNotesStorageKey]
  );
  /** Sidebar search filters (interviewer-only side panel). */
  const [panelQuestionsQuery, setPanelQuestionsQuery] = useState("");
  const [panelTasksQuery, setPanelTasksQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** Shared panel editor (interviewer view) — read Yjs text for AI code review. */
  const panelCodingEditorRef = useRef<CollaborativeEditorHandle>(null);
  const {
    connected,
    participants,
    messages,
    transcript,
    transcriptAnalyses,
    phase,
    config: sharedConfig,
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
    sendTranscript,
    sendTranscriptAnalysis,
    sendPhase,
    sendConfig,
    sendCodingTask,
    sendActivateCodingTask,
    sendQuizStart,
    sendActivateQuiz,
    sendQuizAnswer,
    sendQuizCandidateStarted,
    sendQuizComplete,
    sendQuestionScore,
    sendTimeExtension,
    sendInterviewReport,
  } = usePartyRoom(step !== "join" ? roomCode : null, participant);

  /** This client is the designated host (only host runs the SetupForm and "End interview"). */
  const isHost =
    participant?.role === "interviewer" &&
    !!hostParticipantId &&
    hostParticipantId === participant.id;
  const isInterviewer = participant?.role === "interviewer";

  const effectiveAssignment =
    activeAssignment !== "none"
      ? activeAssignment
      : (activeQuiz as ActiveQuiz | null)?.questions?.length
        ? "quiz"
        : (codingTask as { title?: string } | null)?.title
          ? "coding"
          : "none";

  const activeCodingTaskId = useMemo(() => {
    const t = codingTask as { collaborationTaskId?: string } | null;
    return typeof t?.collaborationTaskId === "string" && t.collaborationTaskId.trim()
      ? t.collaborationTaskId.trim()
      : null;
  }, [codingTask]);

  const activeQuizId = useMemo(() => {
    const q = activeQuiz as ActiveQuiz | null;
    return q?.quizId?.trim() || null;
  }, [activeQuiz]);

  const reportCodingTaskHistory = useMemo((): CodingTaskAssignmentSnapshot[] => {
    return codingTaskHistory.map((entry) => {
      const t = entry.task as Record<string, unknown>;
      return {
        collaborationTaskId: entry.collaborationTaskId,
        title: entry.title,
        description: typeof t.description === "string" ? t.description : "",
        language: typeof t.language === "string" && t.language.trim() ? t.language : "text",
        source: typeof t.source === "string" ? t.source : undefined,
        recordedAt: entry.assignedAt,
      };
    });
  }, [codingTaskHistory]);

  /**
   * Derived interview config. `sendConfig` already updates `sharedConfig` synchronously for the host,
   * and PartyKit broadcasts it to other interviewers — so deriving avoids a redundant local mirror.
   */
  const roomConfig = (sharedConfig as InterviewConfig | null) ?? null;

  /** Re-render once per second while the interview clock is active. */
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "interview" || interviewStartedAt == null) return;
    const t0 = window.setTimeout(() => {
      setClockNow(Date.now());
    }, 0);
    const id = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(id);
    };
  }, [phase, interviewStartedAt, timeExtensionMinutes, interviewEndsAt]);

  const interviewDurationMinutes = roomConfig?.duration ?? 30;
  const timerDisplay = useMemo(
    () =>
      deriveInterviewTimerDisplay({
        phase,
        clockNow,
        interviewStartedAt,
        interviewEndsAt,
        timeExtensionMinutes,
        interviewDurationMinutes,
        lastTimeExtension,
      }),
    [
      phase,
      clockNow,
      interviewStartedAt,
      interviewEndsAt,
      timeExtensionMinutes,
      interviewDurationMinutes,
      lastTimeExtension,
    ]
  );
  const {
    remainingMs,
    scheduleExpired,
    timeWasExtended,
    plannedTotalMinutes,
    showCandidateExtensionBanner,
    showHostWaitingForTimeBanner,
  } = timerDisplay;

  const resolveAgentApiConfig = useCallback(
    (cfg: InterviewConfig | null) => {
      const candidateName =
        cfg?.candidateName ||
        participants.find((p) => p.role === "candidate")?.name ||
        participant?.name ||
        "Candidate";
      return {
        role: cfg?.role || "Software Developer",
        ...(cfg?.roles?.length ? { roles: cfg.roles } : {}),
        difficulty: cfg?.difficulty || "mid",
        topics: cfg?.topics?.length ? cfg.topics : ["general"],
        candidateName,
        ...(cfg?.agentInstructions?.trim() ? { agentInstructions: cfg.agentInstructions } : {}),
        ...(cfg?.uploadedFiles?.length
          ? { uploadedFiles: cfg.uploadedFiles.map((f) => ({ name: f.name, type: f.type, text: f.text })) }
          : {}),
        ...(cfg?.notes?.trim() ? { notes: cfg.notes } : {}),
        ...(cfg?.preInterviewTask
          ? {
              preInterviewTask: {
                title: cfg.preInterviewTask.title,
                description: cfg.preInterviewTask.description,
                language: cfg.preInterviewTask.language,
                starterCode: cfg.preInterviewTask.starterCode,
                ...(cfg.preInterviewTask.submittedCode ? { submittedCode: cfg.preInterviewTask.submittedCode } : {}),
              },
            }
          : {}),
        ...(cfg?.selectedQuestions?.length
          ? { selectedQuestions: cfg.selectedQuestions.map((q) => ({ question: q.question, category: q.category })) }
          : {}),
        ...(cfg?.selectedCodingTasks?.length
          ? {
              selectedCodingTasks: cfg.selectedCodingTasks.map((t) => ({
                title: t.title,
                description: t.description,
                starterCode: t.starterCode,
                language: t.language,
                ...(t.preTask ? { preTask: true as const } : {}),
              })),
            }
          : {}),
        ...buildTranscriptInsightsForAgent(transcriptAnalyses),
        ...buildRecentQuestionScoresForAgent(questionScores),
        ...(transcript.length
          ? {
              recentTranscript: transcript.slice(-80).map((e) => ({
                speaker: e.speaker,
                role:
                  e.speakerRole ??
                  participants.find((p) => p.name === e.speaker)?.role ??
                  (e.speaker === candidateName ? "candidate" : "interviewer"),
                text: e.text,
              })),
            }
          : {}),
        ...buildLiveQuizAgentPayload({
          activeAssignment: "none",
          codingTask: null,
          activeQuiz: activeQuiz as ActiveQuiz | null,
          quizAnswers,
          quizCandidateStarted,
          quizSubmission,
          codingTaskHistory: [],
          quizHistory,
        }),
        collaborativeRoom: true as const,
      };
    },
    [
      participants,
      participant?.name,
      transcriptAnalyses,
      questionScores,
      transcript,
      activeQuiz,
      quizHistory,
      quizAnswers,
      quizSubmission,
      quizCandidateStarted,
    ]
  );

  const assignmentHistoryStrip = (
    <AssignmentHistoryStrip
      activeAssignment={effectiveAssignment}
      codingTaskHistory={codingTaskHistory}
      quizHistory={quizHistory}
      activeCodingTaskId={activeCodingTaskId}
      activeQuizId={activeQuizId}
      onSelectCoding={sendActivateCodingTask}
      onSelectQuiz={sendActivateQuiz}
    />
  );

  const speakerRoleByName = useMemo(() => {
    const map = new Map<string, Participant["role"]>();
    for (const p of participants) map.set(p.name, p.role);
    return map;
  }, [participants]);

  const [analysisBusy, setAnalysisBusy] = useState(false);
  const lastAnalyzedTranscriptLenRef = useRef(0);
  const transcriptLiveRef = useRef(transcript);
  const messagesLiveRef = useRef(messages);
  const analyzeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeInFlightRef = useRef(false);

  /** Refs for async callbacks that should always read latest values. */
  const roomConfigLiveRef = useRef<InterviewConfig | null>(null);
  const participantLiveRef = useRef<Participant | null>(null);

  useEffect(() => {
    transcriptLiveRef.current = transcript;
    messagesLiveRef.current = messages;
  }, [transcript, messages]);

  useEffect(() => {
    if (sidebarSectionsInitRef.current || !roomConfig) return;
    sidebarSectionsInitRef.current = true;
    const hasCv = roomConfig.uploadedFiles?.some(
      (f) => (f.type === "cv" || f.type === "bio") && f.text.trim().length > 50
    );
    setExpandedSection(hasCv ? "cv" : null);
    if (hasCv) setShowTasksPanel(true);
  }, [roomConfig]);

  /** Q&A sidebar must stay height-bound (min-h-0) so overflow-y-auto works; clamp when content shrinks. */
  useEffect(() => {
    if (!showTasksPanel) return;
    const el = qaPanelRef.current;
    if (!el) return;
    const clampScroll = () => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (el.scrollTop > max) el.scrollTop = max;
    };
    clampScroll();
    const ro = new ResizeObserver(clampScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showTasksPanel, expandedSection]);

  useEffect(() => {
    roomConfigLiveRef.current = roomConfig;
  }, [roomConfig]);

  useEffect(() => {
    participantLiveRef.current = participant;
  }, [participant]);

  useEffect(() => {
    lastAnalyzedTranscriptLenRef.current = 0;
  }, [roomCode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentTyping]);

  useEffect(() => {
    if (!inviteDropdownOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = inviteDropdownRef.current;
      if (el && !el.contains(e.target as Node)) setInviteDropdownOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [inviteDropdownOpen]);

  const live = sessionIsLive({
    phase,
    interviewStartedAt,
    hasConfig: sharedConfig != null,
    hasCodingTask: codingTask != null,
    hasActiveQuiz: activeQuiz != null,
    codingTaskHistoryCount: codingTaskHistory.length,
    quizHistoryCount: quizHistory.length,
  });

  const activeStep = resolveActiveStep(phase, step, live);

  const localInterviewReport = useMemo(
    () => (isInterviewer ? loadInterviewReport(roomCode) : null),
    [roomCode, isInterviewer]
  );
  const [blobInterviewReport, setBlobInterviewReport] = useState<InterviewReport | null>(null);

  useEffect(() => {
    if (!isInterviewer || phase !== "review" || interviewReport) {
      setBlobInterviewReport(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/interview-reports/${roomCode}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { markdown?: string; generatedAt?: number };
        if (!data.markdown?.trim() || cancelled) return;
        setBlobInterviewReport({
          markdown: data.markdown.trim(),
          generatedAt: data.generatedAt ?? Date.now(),
        });
      } catch {
        /* blob archive optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInterviewer, phase, interviewReport, roomCode]);

  const reviewReport =
    interviewReport ??
    (phase === "review" ? (blobInterviewReport ?? localInterviewReport) : null);

  useEffect(() => {
    if (reviewReport && isInterviewer && !interviewReport) {
      saveInterviewReport(roomCode, reviewReport);
    } else if (interviewReport && isInterviewer) {
      saveInterviewReport(roomCode, interviewReport);
    }
  }, [interviewReport, reviewReport, roomCode, isInterviewer]);

  useEffect(() => {
    if (live && step === "setup") {
      setStep("interview");
    }
  }, [live, step]);

  // Background speech analysis: only the designated host triggers the API (avoids duplicate calls per interviewer).
  // Other interviewers still receive `transcript-analysis` over PartyKit and see the same panel.
  useEffect(() => {
    if (activeStep !== "interview") return;
    if (!participant || !isHost) return;

    const current = transcriptLiveRef.current;
    const startIdx = lastAnalyzedTranscriptLenRef.current;
    if (!shouldScheduleTranscriptAnalysis(current, startIdx)) {
      return;
    }

    if (analyzeDebounceRef.current) clearTimeout(analyzeDebounceRef.current);
    analyzeDebounceRef.current = setTimeout(async () => {
      analyzeDebounceRef.current = null;
      if (analyzeInFlightRef.current) return;

      const t = transcriptLiveRef.current;
      const si = lastAnalyzedTranscriptLenRef.current;
      const { windowText: wt } = buildTranscriptAnalysisWindow(t, si);
      if (!transcriptWindowReadyForApi(wt)) return;

      analyzeInFlightRef.current = true;
      setAnalysisBusy(true);
      try {
        const cfg = roomConfig;
        const recentChat = messagesLiveRef.current.slice(-12).map((m) => ({
          speaker: m.senderName,
          content: m.content,
        }));
        const res = await fetch("/api/analyze-transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptWindow: wt,
            recentChat,
            role: cfg?.role,
            difficulty: cfg?.difficulty,
            topics: cfg?.topics,
            candidateName:
              cfg?.candidateName ||
              participants.find((p) => p.role === "candidate")?.name,
            panelParticipants: participants.map((p) => ({ name: p.name, role: p.role })),
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          summary?: string;
          score?: number;
          answerQuality?: string;
          followUpQuestions?: unknown;
        };
        if (!res.ok || data.error) return;

        const endLen = transcriptLiveRef.current.length;
        const normalized = normalizeTranscriptAnalysisResponse(data, {
          id: `ta-${Date.now()}`,
          timestamp: Date.now(),
          transcriptEndLength: endLen,
        });
        if (!normalized) return;

        sendTranscriptAnalysis(normalized);
        lastAnalyzedTranscriptLenRef.current = endLen;
      } catch (e) {
        console.error("Transcript analysis failed:", e);
      } finally {
        analyzeInFlightRef.current = false;
        setAnalysisBusy(false);
      }
    }, TRANSCRIPT_ANALYSIS_DEBOUNCE_MS);

    return () => {
      if (analyzeDebounceRef.current) clearTimeout(analyzeDebounceRef.current);
    };
  }, [transcript, messages, roomConfig, participants, activeStep, participant, isHost, sendTranscriptAnalysis]);

  const lastProactiveAnalysisIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeStep !== "interview") return;
    if (!participant || participant.role !== "interviewer") return;
    const latest = transcriptAnalyses[transcriptAnalyses.length - 1];
    if (!latest?.id) return;
    if (lastProactiveAnalysisIdRef.current === latest.id) return;
    lastProactiveAnalysisIdRef.current = latest.id;

    const contextMsg = {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content:
        "Provide me the next best question(s) based on the newest transcript insight and explain what signal to look for in the answer.",
      senderName: participant.name,
      timestamp: Date.now(),
    };

    setAgentTyping(true);
    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messagesLiveRef.current, contextMsg].map((m) => ({
              role: m.role === "agent" ? "agent" : "interviewer",
              content: m.content,
            })),
            config: resolveAgentApiConfig(roomConfigLiveRef.current),
            promptHint:
              "Be proactive. Suggest 2-4 concise next questions, plus brief scoring hints for interviewer.",
          }),
        });
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text) as { content?: string };
          if (data.content) sendAgentResponse(data.content);
        }
      } catch (err) {
        console.error("Proactive assistant error:", err);
      } finally {
        setAgentTyping(false);
      }
    })();
  }, [activeStep, participant, transcriptAnalyses, resolveAgentApiConfig, sendAgentResponse]);

  const handleTranscriptSegment = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const { speaker, speakerRole } = resolveTranscriptSpeakerLabel(
        participantLiveRef.current,
        roomConfigLiveRef.current?.candidateName
      );
      sendTranscript(trimmed, speaker, speakerRole);
    },
    [sendTranscript]
  );

  const speechLanguage = useMemo(
    () => resolveSpeechRecognitionLanguage(roomConfig?.speechLanguage),
    [roomConfig?.speechLanguage]
  );
  const speechLanguageLabel = useMemo(
    () => speechLanguageDisplayLabel(speechLanguage),
    [speechLanguage]
  );

  const {
    isRecording,
    isSupported: speechSupported,
    speechNotice,
    interimText,
    startRecording,
    stopRecording,
  } = useSpeechTranscription({
    onTranscript: handleTranscriptSegment,
    language: speechLanguage,
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setParticipant({
        id: getOrCreateParticipantId(roomCode, inviteRole),
        name: name.trim(),
        role: inviteRole,
        joinedAt: Date.now(),
      });
      setStep("setup");
    }
  };

  const copyRoomInvite = useCallback(
    (kind: InviteCopyKind) => {
      const role: Participant["role"] = kind === "candidate" ? "candidate" : "interviewer";
      void navigator.clipboard.writeText(buildRoomInviteUrl(roomCode, role));
      setInviteCopied(kind);
      setTimeout(() => setInviteCopied(null), 2000);
    },
    [roomCode]
  );

  const handleSetupComplete = async (config: InterviewConfig) => {
    sendConfig(config);
    sendPhase("interview");
    setStep("interview");

    // If the host attached a take-home (with a submitted solution), pre-load it into the shared
    // editor so both interviewer and candidate immediately see the candidate's code and can
    // discuss it. Take precedence over auto-assigning anything else; the AI's system prompt also
    // already instructs it to discuss the take-home early.
    const pre = config.preInterviewTask;
    if (pre && pre.submittedCode && pre.submittedCode.trim().length > 0) {
      sendCodingTask({
        title: `Take-home review: ${pre.title}`,
        description: pre.description,
        language: pre.language,
        // The editor seeds the doc with `starterCode`; using the candidate's submission means the
        // shared buffer opens pre-populated with their solution, ready for live walkthrough.
        starterCode: pre.submittedCode,
        source: "pre-interview-task" as const,
      });
    }

    // Assistant is private to the interviewer; no auto-greeting message is sent on start.
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !participant) return;
    const msg = {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content: chatInput.trim(),
      senderName: participant.name,
      timestamp: Date.now(),
    };
    sendChat(msg);
    setChatInput("");

    // Candidates no longer interact with the AI agent directly — their messages stay in chat for the interviewer.
    if (participant.role === "candidate") return;

    setAgentTyping(true);
    try {
      const cfg = roomConfig;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, msg].map((m) => ({
            role: m.role === "agent" ? "agent" : "interviewer",
            content: m.content,
          })),
          config: resolveAgentApiConfig(cfg),
        }),
      });
      const text = await res.text();
      if (text) {
        const data = JSON.parse(text);
        if (data.content) {
          sendAgentResponse(data.content);
        }
      }
    } catch (err) {
      console.error("Agent error:", err);
    } finally {
      setAgentTyping(false);
    }
  };

  const handleSubmitCodingForReview = useCallback(async () => {
    if (!participant || participant.role !== "interviewer") return;
    if (phase !== "interview") return;
    const task = codingTask as { title?: string; description?: string; language?: string } | null;
    if (!task?.title) return;

    const code = panelCodingEditorRef.current?.getSharedCode() ?? "";
    if (!code.trim()) return;

    const msg = {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content: `Requested AI review of the candidate's current solution for the coding task "${task.title}".`,
      senderName: participant.name,
      timestamp: Date.now(),
    };
    sendChat(msg);
    setAgentTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, msg].map((m) => ({
            role: m.role === "agent" ? "agent" : "interviewer",
            content: m.content,
          })),
          config: resolveAgentApiConfig(roomConfig),
          codingTaskSubmission: {
            title: task.title,
            description: task.description ?? "",
            language: task.language ?? "javascript",
            code,
            requestedBy: "interviewer" as const,
          },
        }),
      });
      const text = await res.text();
      if (text) {
        const data = JSON.parse(text);
        if (data.content) {
          sendAgentResponse(data.content);
        }
      }
    } catch (err) {
      console.error("Coding review agent error:", err);
    } finally {
      setAgentTyping(false);
    }
  }, [
    participant,
    phase,
    codingTask,
    messages,
    roomConfig,
    sendChat,
    sendAgentResponse,
    resolveAgentApiConfig,
  ]);

  const handleReviewQuiz = useCallback(async () => {
    if (!participant || participant.role !== "interviewer") return;
    if (phase !== "interview") return;
    const quiz = activeQuiz as ActiveQuiz | null;
    if (!quiz?.questions?.length) return;

    const ctx = buildLiveQuizAgentContext(quiz, quizAnswers, {
      submission: quizSubmission,
      candidateStarted: quizCandidateStarted,
    });
    const statusLabel =
      ctx.status === "complete"
        ? "completed"
        : ctx.status === "in-progress"
          ? "in progress"
          : "assigned (not started)";

    const msg = {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content: `Requested AI review of live quiz "${quiz.title}" (${statusLabel}, ${ctx.correctCount}/${ctx.totalQuestions} correct so far).`,
      senderName: participant.name,
      timestamp: Date.now(),
    };
    sendChat(msg);
    setAgentTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, msg].map((m) => ({
            role: m.role === "agent" ? "agent" : "interviewer",
            content: m.content,
          })),
          config: resolveAgentApiConfig(roomConfig),
          promptHint: `The interviewer asked you to review the live quiz "${quiz.title}" (status: ${ctx.status}).
Summarize how the candidate performed (${ctx.correctCount}/${ctx.totalQuestions} correct, ${ctx.percentCorrect}%).
Call out weak topics and any skipped or slow questions.
Suggest 3-5 specific verbal follow-up questions to probe mistakes or confirm strengths — reference question numbers/topics when helpful.
If the quiz is still in progress, note what is provisional and what to watch for in remaining answers.`,
        }),
      });
      const text = await res.text();
      if (text) {
        const data = JSON.parse(text) as { content?: string };
        if (data.content) sendAgentResponse(data.content);
      }
    } catch (err) {
      console.error("Quiz review agent error:", err);
    } finally {
      setAgentTyping(false);
    }
  }, [
    participant,
    phase,
    activeQuiz,
    quizAnswers,
    quizSubmission,
    quizCandidateStarted,
    messages,
    roomConfig,
    sendChat,
    sendAgentResponse,
    resolveAgentApiConfig,
  ]);

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const interviewerActiveQuiz =
    effectiveAssignment === "quiz" ? (activeQuiz as ActiveQuiz | null) : null;
  const interviewerCodingTask =
    effectiveAssignment === "coding"
      ? (codingTask as {
          title?: string;
          description?: string;
          language?: string;
          starterCode?: string;
          collaborationTaskId?: string;
          source?: string;
        } | null)
      : null;
  const showInterviewerQuiz = Boolean(interviewerActiveQuiz?.questions?.length);
  const showInterviewerCoding = Boolean(interviewerCodingTask?.title);
  const hasAssignmentHistory = codingTaskHistory.length > 0 || quizHistory.length > 0;

  const configuredRoles = resolveInterviewRoles({
    role: roomConfig?.role || "Frontend Developer",
    roles: roomConfig?.roles,
  });
  const configuredRole = roomConfig?.role || formatInterviewRoleLabel(configuredRoles);
  const configuredDifficulty = roomConfig?.difficulty || "mid";
  const questionGroups = buildQuestionGroupsForRoles(configuredRoles, configuredDifficulty, PREDEFINED_QUESTIONS);
  const codingTaskGroups = buildCodingTaskGroupsForRoles(configuredRoles, configuredDifficulty, CODING_TASK_PRESETS);
  const availableQuestions: PredefinedQuestion[] = flattenGroups(questionGroups);
  const availableTasks: CodingTaskPreset[] = flattenGroups(codingTaskGroups);
  const visiblePanelQuestionGroups = filterGroupsByQuery(questionGroups, panelQuestionsQuery, questionSearchableText);
  const visiblePanelQuestionCount = visiblePanelQuestionGroups.reduce((n, g) => n + g.items.length, 0);
  const visiblePanelTaskGroups = filterGroupsByQuery(codingTaskGroups, panelTasksQuery, taskSearchableText);
  const visiblePanelTaskCount = visiblePanelTaskGroups.reduce((n, g) => n + g.items.length, 0);

  const pendingExistingScore =
    pendingScoreQuestion != null
      ? questionScores[findQuestionScoreIndex(questionScores, pendingScoreQuestion)]
      : undefined;

  /**
   * External PRE-TASKs (interviewer pasted task + candidate solution at setup time). Rendered as a
   * dedicated group at the top of the in-room Coding Tasks panel, separate from the role's preset
   * library. They live on `roomConfig.selectedCodingTasks` with `preTask: true`.
   */
  const externalPreTasks = useMemo<CodingTaskPreset[]>(
    () => (roomConfig?.selectedCodingTasks || []).filter((t) => t.preTask),
    [roomConfig?.selectedCodingTasks]
  );
  const visibleExternalPreTasks = useMemo(() => {
    if (!panelTasksQuery.trim()) return externalPreTasks;
    const tokens = panelTasksQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return externalPreTasks.filter((t) => {
      const hay = taskSearchableText(t).toLowerCase();
      return tokens.every((token) => hay.includes(token));
    });
  }, [externalPreTasks, panelTasksQuery]);

  /**
   * Items the host curated during setup. The agent already receives these via
   * `resolveAgentApiConfig` (selectedQuestions / selectedCodingTasks → /api/chat system prompt),
   * so the AI is nudged to weave them in. The sidebar additionally pins them at the top so the
   * interviewer can fire them off with one click without scrolling/searching the role library
   * mid-interview.
   *
   * `selectedLibraryTasks` excludes external PRE-TASKs — those have their own (violet) group
   * that already sits above the library.
   */
  const selectedQuestionsList = useMemo<PredefinedQuestion[]>(
    () => roomConfig?.selectedQuestions || [],
    [roomConfig?.selectedQuestions]
  );
  const selectedLibraryTasks = useMemo<CodingTaskPreset[]>(
    () => (roomConfig?.selectedCodingTasks || []).filter((t) => !t.preTask),
    [roomConfig?.selectedCodingTasks]
  );

  const visibleSelectedQuestions = useMemo(() => {
    if (!panelQuestionsQuery.trim()) return selectedQuestionsList;
    const tokens = panelQuestionsQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return selectedQuestionsList.filter((q) => {
      const hay = questionSearchableText(q).toLowerCase();
      return tokens.every((token) => hay.includes(token));
    });
  }, [selectedQuestionsList, panelQuestionsQuery]);

  const visibleSelectedLibraryTasks = useMemo(() => {
    if (!panelTasksQuery.trim()) return selectedLibraryTasks;
    const tokens = panelTasksQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return selectedLibraryTasks.filter((t) => {
      const hay = taskSearchableText(t).toLowerCase();
      return tokens.every((token) => hay.includes(token));
    });
  }, [selectedLibraryTasks, panelTasksQuery]);

  /**
   * Library groups with already-pinned items removed, so a selection isn't shown twice (once
   * in the pinned group and again in its role/strand group below).
   */
  const selectedQuestionIds = useMemo(
    () => new Set(selectedQuestionsList.map((q) => q.id)),
    [selectedQuestionsList]
  );
  const dedupedQuestionGroups = useMemo(
    () =>
      visiblePanelQuestionGroups
        .map((g) => ({
          heading: g.heading,
          items: g.items.filter((item) => !selectedQuestionIds.has(item.id)),
        }))
        .filter((g) => g.items.length > 0),
    [visiblePanelQuestionGroups, selectedQuestionIds]
  );

  const selectedTaskIds = useMemo(
    () => new Set(selectedLibraryTasks.map((t) => t.id)),
    [selectedLibraryTasks]
  );
  const dedupedTaskGroups = useMemo(
    () =>
      visiblePanelTaskGroups
        .map((g) => ({
          heading: g.heading,
          items: g.items.filter((item) => !selectedTaskIds.has(item.id)),
        }))
        .filter((g) => g.items.length > 0),
    [visiblePanelTaskGroups, selectedTaskIds]
  );

  const closeQaPanel = useCallback(() => setShowTasksPanel(false), []);

  const handleAssignTask = useCallback((task: CodingTaskPreset) => {
    sendCodingTask({
      title: task.title,
      description: task.description,
      language: task.language,
      starterCode: task.starterCode,
      // External PRE-TASKs carry the candidate's pre-existing solution as `starterCode`; flag the
      // editor so it shows the PRE-TASK badge instead of treating it as a fresh assignment.
      ...(task.preTask ? { source: "external-pre-task" as const } : {}),
    });
    closeQaPanel();
  }, [sendCodingTask, closeQaPanel]);

  const handleAssignQuiz = useCallback(
    (templateId: string) => {
      const template = QUIZ_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      const quiz: ActiveQuiz = {
        quizId: crypto.randomUUID(),
        templateId: template.id,
        title: template.title,
        questions: template.questions,
        secondsPerQuestion: DEFAULT_SECONDS_PER_QUESTION,
        assignedAt: Date.now(),
      };
      sendQuizStart(quiz);
      closeQaPanel();
    },
    [sendQuizStart, closeQaPanel]
  );

  const notifyAgentOfQuestionScore = useCallback(
    async (entry: QuestionScoreEntry, isUpdate: boolean) => {
      if (!participant || participant.role !== "interviewer") return;
      const scoreLine = formatQuestionScoreChatLine(entry);
      setAgentTyping(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              ...messagesLiveRef.current,
              {
                id: `msg-score-${entry.id}-${entry.scoredAt}`,
                role: "user" as const,
                content: scoreLine,
                senderName: participant.name,
                timestamp: Date.now(),
              },
            ].map((m) => ({
              role: m.role === "agent" ? "agent" : "interviewer",
              content: m.content,
            })),
            config: resolveAgentApiConfig(roomConfigLiveRef.current),
            promptHint: isUpdate
              ? `The interviewer updated their rating to ${entry.score}/10 (${scoreLevelShortLabel(entry.score)}) for: "${entry.question}". Briefly acknowledge the change and suggest 2–3 follow-ups calibrated to this score.`
              : `The interviewer rated the candidate's answer ${entry.score}/10 (${scoreLevelShortLabel(entry.score)}) for: "${entry.question}". Acknowledge the score, note what it implies, and suggest 2–3 targeted follow-ups or the next best question.`,
          }),
        });
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text) as { content?: string };
          if (data.content) sendAgentResponse(data.content);
        }
      } catch (err) {
        console.error("Question-score agent notify error:", err);
      } finally {
        setAgentTyping(false);
      }
    },
    [participant, sendAgentResponse, resolveAgentApiConfig]
  );

  const handleQuestionScore = useCallback(
    (score: number, notes?: string) => {
      if (!participant || !pendingScoreQuestion) return;
      const existingIdx = findQuestionScoreIndex(questionScores, pendingScoreQuestion);
      const existing = existingIdx >= 0 ? questionScores[existingIdx] : undefined;
      const isUpdate = Boolean(existing);
      const entry: QuestionScoreEntry = {
        id: existing?.id ?? `qs-${Date.now()}`,
        questionId: pendingScoreQuestion.questionId,
        question: pendingScoreQuestion.question,
        category: pendingScoreQuestion.category,
        score,
        scoredAt: Date.now(),
        scoredBy: participant.name,
        ...(notes ? { notes } : existing?.notes ? { notes: existing.notes } : {}),
      };
      sendQuestionScore(entry);
      setPendingScoreQuestion(null);
      void notifyAgentOfQuestionScore(entry, isUpdate);
    },
    [participant, pendingScoreQuestion, questionScores, sendQuestionScore, notifyAgentOfQuestionScore]
  );

  const beginRescoreQuestion = useCallback((entry: QuestionScoreEntry) => {
    setPendingScoreQuestion({
      question: entry.question,
      questionId: entry.questionId,
      category: entry.category,
    });
  }, []);

  const handleSendQuestionWithScore = useCallback(
    async (question: string, meta?: { questionId?: string; category?: string }) => {
      if (!participant) return;
      const msg = {
        id: `msg-${Date.now()}`,
        role: "user" as const,
        content: question,
        senderName: participant.name,
        timestamp: Date.now(),
      };
      sendChat(msg);
      setPendingScoreQuestion({
        question,
        questionId: meta?.questionId,
        category: meta?.category,
      });

      setAgentTyping(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messagesLiveRef.current, msg].map((m) => ({
              role: m.role === "agent" ? "agent" : "interviewer",
              content: m.content,
            })),
            config: resolveAgentApiConfig(roomConfigLiveRef.current),
            promptHint:
              "The interviewer just asked a question. After your response, remind them to rate the candidate's answer using the 10-level score prompt.",
          }),
        });
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text) as { content?: string };
          if (data.content) sendAgentResponse(data.content);
        }
      } catch (err) {
        console.error("Send-question agent error:", err);
      } finally {
        setAgentTyping(false);
      }
    },
    [participant, sendChat, sendAgentResponse, resolveAgentApiConfig]
  );

  /**
   * Posting a curated question into chat AND firing the agent in one go.
   */
  const handleSendQuestion = useCallback(
    async (question: string, meta?: { questionId?: string; category?: string }) => {
      await handleSendQuestionWithScore(question, meta);
    },
    [handleSendQuestionWithScore]
  );

  const qaSendQuestion = useCallback(
    async (question: string, meta?: { questionId?: string; category?: string }) => {
      await handleSendQuestionWithScore(question, meta);
      closeQaPanel();
    },
    [handleSendQuestionWithScore, closeQaPanel]
  );

  const runReportGeneration = useCallback(async (notesOverride?: string) => {
    const effectiveNotes = (notesOverride ?? sessionReviewNotes).trim();
    setReportGenerating(true);
    try {
      // Snapshot the live shared editor so the report sees the candidate's actual final code
      // (not just the original starterCode in `codingTask`). May be empty if no task was ever
      // assigned in this session — the API treats empty as "not applicable".
      const finalCode = panelCodingEditorRef.current?.getSharedCode() ?? "";

      const res = await fetch("/api/interview-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode,
          participants: participants.map((p) => ({ name: p.name, role: p.role })),
          messages: messages.map((m) => ({
            senderName: m.senderName,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            ...(m.spoken ? { spoken: true } : {}),
          })),
          transcript,
          transcriptAnalyses,
          config: roomConfig,
          codingTask,
          codingTaskHistory: reportCodingTaskHistory,
          quizHistory,
          finalCode,
          interviewerSessionNotes: effectiveNotes || undefined,
          questionScores,
          quizAnswers,
          activeQuiz,
          quizSubmission,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        markdown?: string;
        generatedAt?: number;
      };
      if (!res.ok || typeof data.markdown !== "string" || !data.markdown.trim()) {
        sendInterviewReport({
          markdown: `## Summary unavailable\n\n${data?.error || "The model did not return a report."}\n`,
          generatedAt: Date.now(),
        });
        return;
      }
      sendInterviewReport({
        markdown: data.markdown.trim(),
        generatedAt: data.generatedAt ?? Date.now(),
      });
    } catch (e) {
      console.error(e);
      sendInterviewReport({
        markdown: `## Summary unavailable\n\n${e instanceof Error ? e.message : "Unknown error"}\n`,
        generatedAt: Date.now(),
      });
    } finally {
      setReportGenerating(false);
    }
  }, [
    sessionReviewNotes,
    questionScores,
    quizAnswers,
    activeQuiz,
    quizSubmission,
    roomCode,
    participants,
    messages,
    transcript,
    transcriptAnalyses,
    roomConfig,
    codingTask,
    sendInterviewReport,
  ]);

  const handleEndInterview = useCallback(() => {
    if (!isInterviewer) return;
    setEndInterviewNotes(sessionReviewNotes);
    setEndInterviewModalOpen(true);
  }, [isInterviewer, sessionReviewNotes]);

  const confirmEndInterview = useCallback(async () => {
    setEndInterviewModalOpen(false);
    setSessionReviewNotesPersisted(endInterviewNotes);
    if (isRecording) stopRecording();
    sendPhase("review");
    setStep("review");
    if (interviewReport || localInterviewReport || blobInterviewReport) return;
    await runReportGeneration(endInterviewNotes);
  }, [
    endInterviewNotes,
    setSessionReviewNotesPersisted,
    isRecording,
    stopRecording,
    sendPhase,
    interviewReport,
    localInterviewReport,
    blobInterviewReport,
    runReportGeneration,
  ]);

  // ─── Step 1: Join ──────────────────────────────────────────────
  if (activeStep === "join") {
    return (
      <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Join Interview</CardTitle>
            <CardDescription>
              Code: <span className="font-mono font-bold text-blue-600">{roomCode}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your name"
                  data-testid="join-name"
                  autoFocus
                />
              </div>

              {/* Hide role label entirely from candidates so they aren't aware of the role concept. */}
              {inviteRole !== "candidate" && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2.5">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">You&apos;re joining as</p>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {inviteRoleLabel(inviteRole)}
                  </Badge>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={!name.trim()} data-testid="join-submit">
                Join interview
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Step 2: Setup / Waiting Room ──────────────────────────────
  if (activeStep === "setup") {
    // Only the elected host configures. Other interviewers wait until config arrives.
    if (isHost) {
      return (
        <SetupForm
          onStart={handleSetupComplete}
          title="Interview Setup"
          subtitle={`Configure the interview · Code: ${roomCode}`}
        />
      );
    }

    const waitingMessage =
      participant?.role === "interviewer"
        ? "Another interviewer joined first and is configuring this interview. You'll move to the interview as soon as they start."
        : "Waiting for the interviewer to configure and start the session...";

    return (
      <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4" data-testid="waiting-to-start">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Waiting to start</CardTitle>
            <CardDescription>
              Code: <span className="font-mono font-bold text-blue-600">{roomCode}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium">Participants ({participants.length})</span>
                {connected ? (
                  <Wifi className="h-3 w-3 text-green-500 ml-auto" />
                ) : (
                  <WifiOff className="h-3 w-3 text-red-500 ml-auto" />
                )}
              </div>
              <div className="space-y-1.5">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                    <span className="text-sm">{p.name}</span>
                    <Badge
                      variant="secondary"
                      className={`text-xs capitalize ${
                        p.role === "interviewer"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {p.role}
                      {hostParticipantId === p.id && (
                        <span data-testid="participant-host-marker"> · host</span>
                      )}
                    </Badge>
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-xs text-zinc-400 text-center py-2">Connecting...</p>
                )}
              </div>
            </div>
            <div className="text-center py-6 border-t border-zinc-200 dark:border-zinc-800">
              <Clock className="h-8 w-8 mx-auto mb-2 text-zinc-400 animate-pulse" />
              <p className="text-sm text-zinc-500">{waitingMessage}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Step: Review ─ interviewer panel; candidate sees a thank-you page ──
  if (activeStep === "review") {
    if (participant?.role === "candidate") {
      return (
        <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl" data-testid="candidate-thanks-title">Thanks for participating</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-sm text-zinc-600 dark:text-zinc-400 pt-0">
              <p>We appreciate you taking the time today.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <InterviewReviewPanel
        roomCode={roomCode}
        report={reviewReport}
        generating={reportGenerating}
        role={participant?.role ?? "interviewer"}
        questionScores={questionScores}
        onRetryReport={isHost ? runReportGeneration : undefined}
        sessionNotesGate={
          isHost
            ? {
                value: sessionReviewNotes,
                onChange: setSessionReviewNotesPersisted,
                minLength: MIN_FINAL_NOTES_CHARS_HINT,
                optional: hasUsableTranscript(transcript),
              }
            : undefined
        }
      />
    );
  }

  // ─── Step 3: Interview Room ────────────────────────────────────

  // ── Candidate view: coding task or quiz only (no AI agent chat) ──
  if (participant?.role === "candidate") {
    let liveQuiz: ActiveQuiz | null =
      effectiveAssignment === "quiz" ? (activeQuiz as ActiveQuiz | null) : null;
    let candidateQuizAnswers = quizAnswers;
    let candidateQuizStarted = quizCandidateStarted;
    if (!liveQuiz?.questions?.length) {
      const inProgress = [...quizHistory].reverse().find((h) => {
        const q = h.quiz as ActiveQuiz;
        return q?.questions?.length && !h.quizSubmission;
      });
      if (inProgress) {
        liveQuiz = inProgress.quiz as ActiveQuiz;
        candidateQuizAnswers = inProgress.answers as QuizAnswerEntry[];
        candidateQuizStarted = inProgress.quizCandidateStarted;
      }
    }
    const codingForView =
      effectiveAssignment === "coding"
        ? (codingTask as {
            title?: string;
            description?: string;
            language?: string;
            starterCode?: string;
            collaborationTaskId?: string;
            source?: string;
          } | null)
        : null;
    const showQuiz = Boolean(liveQuiz?.questions?.length);
    const showCoding = Boolean(codingForView?.title);
    const hasHistory = codingTaskHistory.length > 0 || quizHistory.length > 0;

    return (
      <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm font-bold text-blue-600">{roomCode}</span>
            <Badge variant="secondary" className="text-xs">Interview in progress</Badge>
            {phase === "interview" && interviewStartedAt != null && remainingMs != null && (
              <div
                className={`flex items-center gap-1 text-xs tabular-nums ${
                  timeWasExtended
                    ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                    : scheduleExpired
                      ? "text-amber-600 dark:text-amber-400 font-semibold"
                      : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {timeWasExtended
                    ? `${formatRemainingMs(remainingMs)} left`
                    : scheduleExpired
                      ? "Time's up"
                      : `${formatRemainingMs(remainingMs)} left`}
                </span>
                <span className="text-zinc-400 font-normal">· {plannedTotalMinutes} min block</span>
              </div>
            )}
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-green-600" data-testid="party-connected">
                <Wifi className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-500" data-testid="party-disconnected">
                <WifiOff className="h-3 w-3" /> Disconnected
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{participants.length}</span>
            </div>
            {speechSupported && (
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isRecording) stopRecording();
                    else startRecording();
                  }}
                >
                  {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {isRecording ? "Stop" : "Record"}
                </Button>
                <span className="text-[10px] text-zinc-500 text-right max-w-[18rem] leading-snug">
                  {isRecording ? "Listening" : "STT"}: {speechLanguageLabel}
                </span>
                {speechNotice && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 text-right max-w-[18rem] leading-snug break-words">
                    {speechNotice}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {showCandidateExtensionBanner && lastTimeExtension && (
          <div
            data-testid="candidate-time-extension-banner"
            className="px-4 py-2 text-center text-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 border-b border-emerald-200 dark:border-emerald-900/50"
          >
            The interviewer added {lastTimeExtension.minutes} more minutes. You have{" "}
            {formatRemainingMs(remainingMs ?? 0)} remaining.
          </div>
        )}
        {showHostWaitingForTimeBanner && (
          <div
            data-testid="candidate-time-up-waiting"
            className="px-4 py-2 text-center text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border-b border-amber-200 dark:border-amber-900/50"
          >
            Scheduled time has ended. Please wait — the host can add more time or end the interview.
          </div>
        )}

        {hasHistory && assignmentHistoryStrip}

        <div className="flex-1 flex overflow-hidden min-h-0">
          {showQuiz && liveQuiz ? (
            <div data-testid="live-quiz-panel" className="flex-1 min-h-0 flex flex-col">
            <LiveQuizPanel
              key={liveQuiz.quizId}
              quiz={liveQuiz}
              participantName={participant?.name || "Candidate"}
              existingAnswers={candidateQuizAnswers}
              onAnswer={sendQuizAnswer}
              onStart={sendQuizCandidateStarted}
              forceStarted={candidateQuizStarted}
              onComplete={(answers) =>
                sendQuizComplete({
                  answers,
                  submittedAt: Date.now(),
                  candidateName: participant?.name,
                })
              }
            />
            </div>
          ) : showCoding && codingForView ? (
            <CollaborativeEditor
              key={codingForView.collaborationTaskId ?? codingForView.title}
              roomId={roomCode}
              participantName={participant?.name || "Anonymous"}
              participantRole="candidate"
              language={codingForView.language || "javascript"}
              taskTitle={codingForView.title}
              taskDescription={codingForView.description}
              starterCode={codingForView.starterCode}
              collaborationTaskId={codingForView.collaborationTaskId}
              taskSource={
                codingForView.source === "pre-interview-task"
                  ? "pre-interview-task"
                  : codingForView.source === "external-pre-task"
                    ? "external-pre-task"
                    : undefined
              }
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" data-testid="candidate-waiting-assignment">
              <MessageSquare className="h-10 w-10 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500 max-w-sm">
                {hasHistory
                  ? "Pick a coding task or quiz above to continue, or wait for a new assignment."
                  : "Waiting for the interviewer to assign a coding task or quiz."}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Interviewer view ──
  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {endInterviewModalOpen && isInterviewer && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4" data-testid="end-interview-modal">
          <Card className="w-full max-w-lg shadow-xl">
            <CardHeader>
              <CardTitle>Final notes &amp; end interview</CardTitle>
              <CardDescription>
                Add your closing impressions before generating the AI report. These notes are especially important when no transcript was captured.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={endInterviewNotes}
                onChange={(e) => setEndInterviewNotes(e.target.value)}
                rows={6}
                data-testid="end-interview-notes"
                placeholder="Strengths, concerns, topics covered, recommendation hints…"
                className="w-full text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2"
              />
              <p className="text-xs text-zinc-500">
                Optional. For better report quality, include at least {MIN_FINAL_NOTES_CHARS_HINT} characters.
              </p>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setEndInterviewModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" data-testid="confirm-end-interview" onClick={() => void confirmEndInterview()}>
                  End interview &amp; generate report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {phase === "interview" && scheduleExpired && isInterviewer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" data-testid="time-up-modal">
          <Card className="w-full max-w-md shadow-xl border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle>Scheduled time is up</CardTitle>
              <CardDescription>
                Add more time to continue, or end the interview to generate the AI review — same as the &quot;End interview&quot; flow (nothing is cleared until the review step).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button type="button" className="w-full" data-testid="add-time-30" onClick={() => sendTimeExtension(30)}>
                Add 30 minutes
              </Button>
              <Button type="button" className="w-full" variant="secondary" data-testid="add-time-60" onClick={() => sendTimeExtension(60)}>
                Add 1 hour
              </Button>
              <Button type="button" className="w-full" variant="destructive" onClick={handleEndInterview}>
                End interview &amp; generate review
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-blue-600">{roomCode}</span>
          {phase === "interview" && (
            <div className="relative border-l border-zinc-200 dark:border-zinc-700 pl-3 ml-1" ref={inviteDropdownRef}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs font-medium"
                data-testid="invite-dropdown-btn"
                onClick={() => setInviteDropdownOpen((o) => !o)}
                aria-expanded={inviteDropdownOpen}
                aria-haspopup="menu"
              >
                <Copy className="h-3.5 w-3.5" />
                Invite links
                <ChevronDown className={`h-3.5 w-3.5 opacity-70 transition-transform ${inviteDropdownOpen ? "rotate-180" : ""}`} />
              </Button>
              {inviteDropdownOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[12.5rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="invite-link-candidate"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => {
                      copyRoomInvite("candidate");
                      setInviteDropdownOpen(false);
                    }}
                  >
                    {inviteCopied === "candidate" ? (
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    Candidate link
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="invite-link-interviewer"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => {
                      copyRoomInvite("interviewer");
                      setInviteDropdownOpen(false);
                    }}
                  >
                    {inviteCopied === "interviewer" ? (
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    Interviewer link
                  </button>
                </div>
              )}
            </div>
          )}
          <Badge variant="secondary" className="text-xs capitalize">{phase}</Badge>
          {phase === "interview" && interviewStartedAt != null && remainingMs != null && (
            <div
              className={`flex items-center gap-1 text-xs tabular-nums ${
                timeWasExtended
                  ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                  : scheduleExpired
                    ? "text-amber-600 dark:text-amber-400 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                {timeWasExtended && lastTimeExtension
                  ? `+${lastTimeExtension.minutes} min added · ${formatRemainingMs(remainingMs)} left`
                  : scheduleExpired
                    ? "Time's up"
                    : `${formatRemainingMs(remainingMs)} left`}
              </span>
              <span className="text-zinc-400 font-normal">· {plannedTotalMinutes} min block</span>
            </div>
          )}
          {showHostWaitingForTimeBanner && !isHost && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300 max-w-[14rem] leading-snug">
              Waiting for host to add time or end the interview.
            </span>
          )}
          {isHost && (
            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Host
            </Badge>
          )}
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-green-600" data-testid="party-connected">
              <Wifi className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-500" data-testid="party-disconnected">
              <WifiOff className="h-3 w-3" /> Disconnected
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {participants.map((p) => (
              <div
                key={p.id}
                title={`${p.name} (${p.role}${hostParticipantId === p.id ? " · host" : ""})`}
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-950 ${
                  p.role === "interviewer" ? "bg-purple-500" : "bg-blue-500"
                }`}
              >
                {p.name[0]?.toUpperCase()}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{participants.length}</span>
          </div>
          {phase === "interview" && (codingTask as { title?: string } | null)?.title && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-violet-300 text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-950/50"
              data-testid="review-candidate-code-btn"
              onClick={handleSubmitCodingForReview}
              disabled={agentTyping}
              title="Send the shared editor (candidate's current work) to the AI for feedback"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Review candidate code
            </Button>
          )}
          {phase === "interview" && showInterviewerQuiz && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-indigo-300 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
              data-testid="review-quiz-btn"
              onClick={() => void handleReviewQuiz()}
              disabled={agentTyping}
              title="Ask the assistant to summarize quiz results and suggest follow-up questions"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Review quiz
            </Button>
          )}
          {isInterviewer && phase === "interview" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
              data-testid="end-interview-btn"
              onClick={handleEndInterview}
              disabled={reportGenerating}
              title="End interview and generate AI summary for everyone"
            >
              <StopCircle className="h-3.5 w-3.5" />
              End interview
            </Button>
          )}
          {speechSupported && (
            <div className="flex flex-col items-end gap-0.5">
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isRecording) stopRecording();
                  else startRecording();
                }}
                title={isRecording ? "Stop recording" : "Start recording"}
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isRecording ? "Stop" : "Record"}
              </Button>
              <span className="text-[10px] text-zinc-500 text-right max-w-[18rem] leading-snug">
                {isRecording ? "Listening" : "STT"}: {speechLanguageLabel}
              </span>
              {speechNotice && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 text-right max-w-[18rem] leading-snug break-words">
                  {speechNotice}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <InterviewAssistantColumns
          speechLanguageLabel={speechLanguageLabel}
          isRecording={isRecording}
          transcriptLineCount={transcript.length}
          insightsCount={transcriptAnalyses.length}
          analysisBusy={analysisBusy}
          transcriptBody={
            <div className="p-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {transcript.length === 0 && !interimText ? (
                <p className="text-zinc-400 italic leading-relaxed">
                  Speech from the <strong>candidate</strong> and every <strong>interviewer</strong> appears here after each person taps <strong>Record</strong> on their device (own mic). Recognition language: <strong>{speechLanguageLabel}</strong> (set by host at setup).
                </p>
              ) : (
                transcript.slice(-30).map((entry, i) => {
                  const lineRole = entry.speakerRole ?? speakerRoleByName.get(entry.speaker);
                  const isCandidateLine =
                    lineRole === "candidate" || entry.speaker === "Candidate";
                  const isInterviewerLine = lineRole === "interviewer";
                  return (
                    <div
                      key={`${entry.timestamp}-${i}-${entry.text.slice(0, 12)}`}
                      className={
                        isCandidateLine
                          ? "text-blue-800 dark:text-blue-200"
                          : isInterviewerLine
                            ? "text-purple-900 dark:text-purple-200"
                            : undefined
                      }
                    >
                      <span className="font-medium">{entry.speaker}</span>
                      {lineRole && (
                        <span className="text-[10px] text-zinc-500 ml-1">({lineRole})</span>
                      )}
                      <span className="text-zinc-500">: </span>
                      {entry.text}
                    </div>
                  );
                })
              )}
              {interimText && (
                <div className="text-zinc-400 italic">
                  <span className="font-medium">{participant?.name}:</span> {interimText}…
                </div>
              )}
            </div>
          }
          insightsBody={
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-violet-700/80 dark:text-violet-300/80 px-0.5">
                Private to interviewers — not shown to candidate
              </p>
              {transcriptAnalyses.length === 0 && !analysisBusy ? (
                <p className="text-xs text-violet-800/75 dark:text-violet-200/75 italic leading-relaxed">
                  When anyone records, the host&apos;s client analyzes the latest transcript window — answer quality, panel context, and follow-up ideas.
                </p>
              ) : (
                transcriptAnalyses.slice(-8).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-violet-200/90 dark:border-violet-800/80 bg-white/90 dark:bg-zinc-900/90 p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="secondary"
                        className="text-[10px] capitalize bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
                      >
                        {a.answerQuality.replace("-", " ")}
                      </Badge>
                      {a.score > 0 && (
                        <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">Score {a.score}/10</span>
                      )}
                      <span className="text-[10px] text-zinc-400 ml-auto">{new Date(a.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{a.summary}</p>
                    {a.followUpQuestions && a.followUpQuestions.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-violet-100 dark:border-violet-900/60">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300 mb-1">
                          Suggested follow-ups
                        </div>
                        <ul className="space-y-1">
                          {a.followUpQuestions.map((q, i) => {
                            const key = `${a.id}::${i}`;
                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  onClick={() => void handleSendQuestion(q, { category: "follow-up" })}
                                  className="group w-full text-left flex items-start gap-1.5 rounded px-1.5 py-1 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                                  title="Ask this follow-up via assistant"
                                >
                                  <span className="flex-1 text-zinc-700 dark:text-zinc-200 leading-snug">
                                    {q}
                                  </span>
                                  <Send className="h-3 w-3 mt-0.5 shrink-0 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          }
          chat={
            <>
              {(pendingScoreQuestion || questionScores.length > 0) && (
                <div
                  className="shrink-0 border-b border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-2 space-y-2 max-h-[40%] overflow-y-auto"
                  data-testid="question-scores-dock"
                >
                  {pendingScoreQuestion && (
                    <QuestionScorePrompt
                      question={pendingScoreQuestion.question}
                      category={pendingScoreQuestion.category}
                      previousScore={pendingExistingScore?.score}
                      onScore={(score) => handleQuestionScore(score)}
                      onDismiss={() => setPendingScoreQuestion(null)}
                    />
                  )}
                  {questionScores.length > 0 && (
                    <QuestionScoresPanel
                      scores={questionScores}
                      onRescore={beginRescoreQuestion}
                      compact
                    />
                  )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-zinc-400 mt-8">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet.</p>
                    <p className="mt-1 text-xs">Send a message to start the interview conversation</p>
                  </div>
                ) : (
                  messages
                    .filter((msg) => !msg.content.trimStart().startsWith("[Manual score"))
                    .map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.role === "agent" ? "items-start" : "items-end"}`}
                      >
                        <div className="text-xs text-zinc-500 mb-0.5 flex items-center gap-1">
                          {msg.spoken && (
                            <Mic
                              className="h-3 w-3 text-blue-400"
                              aria-label="Spoken (transcribed from microphone)"
                            />
                          )}
                          <span>{msg.senderName}</span>
                        </div>
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            msg.role === "agent"
                              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          {msg.role === "agent" ? <AgentMessage content={msg.content} /> : msg.content}
                        </div>
                      </div>
                    ))
                )}
                {agentTyping && (
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-zinc-500 mb-0.5">AI Agent</div>
                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500">Thinking...</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    data-testid="chat-input"
                    placeholder="Type a message (sends to AI agent)..."
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button size="sm" data-testid="chat-send" onClick={handleSendMessage} disabled={!chatInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          }
        />

        <div className="flex-1 flex flex-col min-h-0 relative">
          <QaFloatingDrawer
            open={showTasksPanel}
            onOpenChange={setShowTasksPanel}
            panelRef={qaPanelRef}
          >
            <div className="flex flex-col">
            <div className="border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setExpandedSection(expandedSection === "questions" ? null : "questions")}
                className="sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-3 text-sm font-medium bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors border-b border-transparent"
              >
                {expandedSection === "questions" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                Questions ({availableQuestions.length})
                {selectedQuestionsList.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[9px] py-0 px-1.5 font-normal bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900/60"
                  >
                    <Pin className="h-2.5 w-2.5 mr-0.5" />
                    {selectedQuestionsList.length} pinned
                  </Badge>
                )}
              </button>
              {expandedSection === "questions" && (
                <div className="px-3 pb-3 space-y-3">
                  {availableQuestions.length === 0 ? (
                    <p className="text-xs text-zinc-400 px-1">No questions available for this role.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="search"
                          value={panelQuestionsQuery}
                          onChange={(e) => setPanelQuestionsQuery(e.target.value)}
                          placeholder="Search questions…"
                          className="flex-1 px-2 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                        {panelQuestionsQuery && (
                          <button
                            type="button"
                            onClick={() => setPanelQuestionsQuery("")}
                            className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-1"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {panelQuestionsQuery && (
                        <p className="text-[10px] text-zinc-500 px-0.5">
                          {visiblePanelQuestionCount} of {availableQuestions.length} match
                        </p>
                      )}
                      {visiblePanelQuestionCount === 0 && panelQuestionsQuery ? (
                        <p className="text-xs text-zinc-400 px-1">No questions match.</p>
                      ) : (
                        <>
                          {/* Pinned at setup — questions the host curated. The agent already
                              receives them via the system prompt; the panel surfaces them so
                              the host can fire any of them at the candidate with one click. */}
                          {visibleSelectedQuestions.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 px-0.5 flex items-center gap-1">
                                <Pin className="h-3 w-3" />
                                Pinned at setup
                              </p>
                              {visibleSelectedQuestions.map((q) => (
                                <div
                                  key={`pinned-q-${q.id}`}
                                  className="group rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-2.5 hover:border-amber-400 dark:hover:border-amber-700 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <Badge variant="secondary" className="text-[10px] mb-1 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border-amber-200 dark:border-amber-900/50">
                                        {q.category}
                                      </Badge>
                                      <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">{q.question}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="shrink-0 h-7 w-7 p-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/60"
                                      data-testid="send-question-btn"
                                      onClick={() => qaSendQuestion(q.question, { questionId: q.id, category: q.category })}
                                      title="Send this question to chat (the agent will react)"
                                    >
                                      <Send className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {dedupedQuestionGroups.map((group) => (
                            <div key={group.heading} className="space-y-1.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 px-0.5">{group.heading}</p>
                              {group.items.map((q) => (
                                <div key={q.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-blue-300 dark:hover:border-blue-800 transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <Badge variant="secondary" className="text-[10px] mb-1">{q.category}</Badge>
                                      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{q.question}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 w-7 p-0"
                                      data-testid="send-question-btn"
                                      onClick={() => qaSendQuestion(q.question, { questionId: q.id, category: q.category })}
                                      title="Send this question to chat"
                                    >
                                      <Send className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                data-testid="sidebar-tasks-toggle"
                onClick={() => setExpandedSection(expandedSection === "tasks" ? null : "tasks")}
                className="sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-3 text-sm font-medium bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                {expandedSection === "tasks" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Code2 className="h-3.5 w-3.5 text-green-500" />
                Coding Tasks ({externalPreTasks.length + availableTasks.length})
                {selectedLibraryTasks.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[9px] py-0 px-1.5 font-normal bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-900/60"
                  >
                    <Pin className="h-2.5 w-2.5 mr-0.5" />
                    {selectedLibraryTasks.length} pinned
                  </Badge>
                )}
              </button>
              {expandedSection === "tasks" && (
                <div className="px-3 pb-3 space-y-3">
                  {externalPreTasks.length === 0 && availableTasks.length === 0 ? (
                    <p className="text-xs text-zinc-400 px-1">No coding tasks available.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="search"
                          value={panelTasksQuery}
                          onChange={(e) => setPanelTasksQuery(e.target.value)}
                          placeholder="Search tasks…"
                          className="flex-1 px-2 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-green-500/40"
                        />
                        {panelTasksQuery && (
                          <button
                            type="button"
                            onClick={() => setPanelTasksQuery("")}
                            className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-1"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {panelTasksQuery && (
                        <p className="text-[10px] text-zinc-500 px-0.5">
                          {visibleExternalPreTasks.length + visiblePanelTaskCount} of {externalPreTasks.length + availableTasks.length} match
                        </p>
                      )}
                      {/* Pinned at setup — coding tasks the host curated. The agent already
                          knows about these via the system prompt; surfacing them at the top
                          lets the interviewer assign them with one click instead of scrolling
                          through the role library mid-interview. Always-on Assign button so
                          the action is one tap away (no hover needed). */}
                      {visibleSelectedLibraryTasks.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 px-0.5 flex items-center gap-1">
                            <Pin className="h-3 w-3" />
                            Pinned at setup
                          </p>
                          {visibleSelectedLibraryTasks.map((task) => (
                            <div
                              key={`pinned-t-${task.id}`}
                              className="group rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-2.5 hover:border-amber-400 dark:hover:border-amber-700 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{task.title}</span>
                                    <Badge variant="secondary" className="text-[10px]">{task.language}</Badge>
                                    {task.difficulty && (
                                      <Badge variant="secondary" className="text-[10px] capitalize">{task.difficulty}</Badge>
                                    )}
                                    {task.staticReview && (
                                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200">
                                        Static
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-500 whitespace-pre-line max-h-40 overflow-y-auto pr-0.5">{task.description}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 h-7 px-2 text-[10px] text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/60"
                                  data-testid={`assign-coding-${task.id}`}
                                  onClick={() => handleAssignTask(task)}
                                  title="Assign this task to the shared editor"
                                >
                                  Assign
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* PRE-TASKs group — shown after pinned selections so the host can still
                          open a candidate's external solution for discussion when relevant. */}
                      {visibleExternalPreTasks.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 px-0.5">
                            Pre-tasks (external)
                          </p>
                          {visibleExternalPreTasks.map((task) => (
                            <div
                              key={task.id}
                              className="group rounded-lg border border-violet-200 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20 p-2.5 hover:border-violet-400 dark:hover:border-violet-700 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <Badge variant="secondary" className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-900/50">
                                      PRE-TASK
                                    </Badge>
                                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{task.title}</span>
                                    <Badge variant="secondary" className="text-[10px]">{task.language}</Badge>
                                  </div>
                                  {task.description && (
                                    <p className="text-[11px] text-zinc-500 whitespace-pre-line max-h-40 overflow-y-auto pr-0.5">{task.description}</p>
                                  )}
                                  <p className="text-[10px] text-zinc-400 mt-1">
                                    Opens with the candidate&apos;s solution loaded ({task.starterCode.split("\n").length} lines)
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 px-2 text-[10px]"
                                  data-testid={`assign-coding-${task.id}`}
                                  onClick={() => handleAssignTask(task)}
                                  title="Open this PRE-TASK in the shared editor with the candidate's solution"
                                >
                                  Open
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {visibleExternalPreTasks.length === 0 && visiblePanelTaskCount === 0 && panelTasksQuery ? (
                        <p className="text-xs text-zinc-400 px-1">No coding tasks match.</p>
                      ) : (
                        dedupedTaskGroups.map((group) => (
                          <div key={group.heading} className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 px-0.5">{group.heading}</p>
                            {group.items.map((task) => (
                              <div key={task.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-green-300 dark:hover:border-green-800 transition-colors">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{task.title}</span>
                                      <Badge variant="secondary" className="text-[10px]">{task.language}</Badge>
                                      {task.difficulty && <Badge variant="secondary" className="text-[10px] capitalize">{task.difficulty}</Badge>}
                                      {task.staticReview && (
                                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200">
                                          Static
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-zinc-500 whitespace-pre-line max-h-40 overflow-y-auto pr-0.5">{task.description}</p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 px-2 text-[10px]"
                                    data-testid={`assign-coding-${task.id}`}
                                    onClick={() => handleAssignTask(task)}
                                    title="Assign this task to the editor"
                                  >
                                    Assign
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                data-testid="sidebar-quizzes-toggle"
                onClick={() => setExpandedSection(expandedSection === "quiz" ? null : "quiz")}
                className="sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-3 text-sm font-medium bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                {expandedSection === "quiz" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <ListChecks className="h-3.5 w-3.5 text-indigo-500" />
                Quizzes ({QUIZ_TEMPLATES.length})
              </button>
              {expandedSection === "quiz" && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[10px] text-zinc-500 px-0.5">
                    Assign a live quiz (3 min per question). Or{" "}
                    <a href="/quiz/new" className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                      send async quiz link
                    </a>
                    .
                  </p>
                  {QUIZ_TEMPLATES.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{t.title}</p>
                          <p className="text-[10px] text-zinc-500">{t.questions.length} questions · {t.track}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-7 px-2 text-[10px]"
                          data-testid={`assign-quiz-${t.id}`}
                          onClick={() => handleAssignQuiz(t.id)}
                        >
                          Assign
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(activeQuiz as ActiveQuiz | null)?.title && (
                    <div className="pt-2 border-t border-indigo-200/80 dark:border-indigo-900/50 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200 px-0.5">
                        Active quiz
                      </p>
                      <QuizResultsSummary
                        quiz={activeQuiz as ActiveQuiz}
                        answers={quizAnswers}
                        submission={quizSubmission}
                        status={
                          quizSubmission
                            ? "complete"
                            : quizCandidateStarted
                              ? "in-progress"
                              : "waiting"
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-[11px] border-indigo-300 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-200"
                        data-testid="review-quiz-btn"
                        onClick={() => void handleReviewQuiz()}
                        disabled={agentTyping}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Ask agent to review quiz
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                data-testid="sidebar-cv-toggle"
                onClick={() => setExpandedSection(expandedSection === "cv" ? null : "cv")}
                className="sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-3 text-sm font-medium bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                title="AI-generated suggestions based on the candidate's CV (interviewer only)"
              >
                {expandedSection === "cv" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <FileSearch className="h-3.5 w-3.5 text-purple-500" />
                CV insights
                <Badge variant="secondary" className="ml-1 text-[9px] py-0 px-1.5 font-normal">private</Badge>
              </button>
              <div className={expandedSection === "cv" ? undefined : "hidden"}>
                <CvSuggestionsPanel
                  config={roomConfig}
                  onSendQuestion={handleSendQuestion}
                  onAssignTask={(task) =>
                    sendCodingTask({
                      title: task.title,
                      description: task.description,
                      language: task.language,
                      starterCode: task.starterCode,
                    })
                  }
                  onUploadFile={(file) => {
                    if (!roomConfig) return;
                    const updated: InterviewConfig = {
                      ...roomConfig,
                      uploadedFiles: [...(roomConfig.uploadedFiles ?? []), file],
                    };
                    sendConfig(updated);
                  }}
                />
              </div>
            </div>
            </div>
          </QaFloatingDrawer>

          {hasAssignmentHistory && assignmentHistoryStrip}
          {showInterviewerQuiz ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-indigo-50/50 dark:bg-indigo-950/20 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-indigo-900 dark:text-indigo-100">Live quiz — candidate view</p>
                  <p className="text-[10px] text-indigo-800/80 dark:text-indigo-200/80">
                    Results update in real time. The assistant also receives quiz data on every reply.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 text-[11px] border-indigo-300 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-200"
                  onClick={() => void handleReviewQuiz()}
                  disabled={agentTyping}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Review quiz
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <QuizResultsSummary
                  quiz={interviewerActiveQuiz!}
                  answers={quizAnswers}
                  submission={quizSubmission}
                  status={
                    quizSubmission
                      ? "complete"
                      : quizCandidateStarted
                        ? "in-progress"
                        : "waiting"
                  }
                />
                {quizCandidateStarted && !quizSubmission && (
                  <LiveQuizPanel
                    key={interviewerActiveQuiz!.quizId}
                    quiz={interviewerActiveQuiz!}
                    participantName="Candidate"
                    existingAnswers={quizAnswers}
                    onAnswer={() => {}}
                    onComplete={() => {}}
                    readOnly
                    forceStarted={quizCandidateStarted}
                  />
                )}
              </div>
            </div>
          ) : showInterviewerCoding ? (
            <CollaborativeEditor
              key={interviewerCodingTask!.collaborationTaskId ?? interviewerCodingTask!.title}
              ref={panelCodingEditorRef}
              roomId={roomCode}
              participantName={participant?.name || "Anonymous"}
              participantRole="interviewer"
              isSeeder={isHost}
              language={interviewerCodingTask!.language || "javascript"}
              taskTitle={interviewerCodingTask!.title}
              taskDescription={interviewerCodingTask!.description}
              starterCode={interviewerCodingTask!.starterCode}
              collaborationTaskId={interviewerCodingTask!.collaborationTaskId}
              taskSource={
                interviewerCodingTask!.source === "pre-interview-task"
                  ? "pre-interview-task"
                  : interviewerCodingTask!.source === "external-pre-task"
                    ? "external-pre-task"
                    : undefined
              }
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-zinc-500">
              {hasAssignmentHistory
                ? "Select a coding task or quiz from history above, or assign a new one from the Q&A panel."
                : "Assign a coding task or quiz from the Q&A panel."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
