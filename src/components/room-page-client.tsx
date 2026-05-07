"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { usePartyRoom } from "@/hooks/use-party-room";
import { useSpeechTranscription } from "@/hooks/use-speech-transcription";
import type { Participant } from "@/types/room";
import type { InterviewConfig } from "@/types/interview";
import type { CodingTaskPreset, PredefinedQuestion } from "@/types/interview";
import { PREDEFINED_QUESTIONS, CODING_TASK_PRESETS } from "@/data/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollaborativeEditor, type CollaborativeEditorHandle } from "@/components/collaborative-editor";
import { SetupForm } from "@/components/setup-form";
import { InterviewReviewPanel } from "@/components/interview-review";
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
} from "lucide-react";

const TRANSCRIPT_ANALYSIS_DEBOUNCE_MS = 4000;
const TRANSCRIPT_ANALYSIS_MIN_CHARS = 28;
const TRANSCRIPT_ANALYSIS_GATE_CHARS = 40;
const TRANSCRIPT_ANALYSIS_GATE_LINES = 2;

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

/** Build invite URL: interviewer link is role-aware, candidate link is neutral. */
function buildRoomInviteUrl(roomCode: string, role: Participant["role"]): string {
  if (typeof window === "undefined") return "";
  const base = window.location.origin;
  if (role === "interviewer") return `${base}/interview/${roomCode}`;
  return `${base}/invite/${roomCode}`;
}

function inviteRoleLabel(role: Participant["role"]): string {
  if (role === "interviewer") return "Interviewer (host)";
  return "Candidate";
}

type Step = "join" | "setup" | "interview" | "review";
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
  const [showTasksPanel, setShowTasksPanel] = useState(true);
  const [expandedSection, setExpandedSection] = useState<"questions" | "tasks" | null>("questions");
  const [reportGenerating, setReportGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const greetingSentRef = useRef(false);

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
    hostParticipantId,
    sendChat,
    sendAgentResponse,
    sendTranscript,
    sendTranscriptAnalysis,
    sendPhase,
    sendConfig,
    sendCodingTask,
    interviewReport,
    sendInterviewReport,
  } = usePartyRoom(step !== "join" ? roomCode : null, participant);

  /** This client is the designated host (only host runs the SetupForm and "End interview"). */
  const isHost =
    participant?.role === "interviewer" &&
    !!hostParticipantId &&
    hostParticipantId === participant.id;

  /**
   * Derived interview config. `sendConfig` already updates `sharedConfig` synchronously for the host,
   * and PartyKit broadcasts it to other interviewers — so deriving avoids a redundant local mirror.
   */
  const roomConfig = (sharedConfig as InterviewConfig | null) ?? null;

  const resolveAgentApiConfig = useCallback(
    (cfg: InterviewConfig | null) => {
      const candidateName =
        cfg?.candidateName ||
        participants.find((p) => p.role === "candidate")?.name ||
        participant?.name ||
        "Candidate";
      return {
        role: cfg?.role || "Software Developer",
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
              })),
            }
          : {}),
      };
    },
    [participants, participant?.name]
  );

  const [analysisBusy, setAnalysisBusy] = useState(false);
  const lastAnalyzedTranscriptLenRef = useRef(0);
  const transcriptLiveRef = useRef(transcript);
  const messagesLiveRef = useRef(messages);
  const analyzeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeInFlightRef = useRef(false);

  useEffect(() => {
    transcriptLiveRef.current = transcript;
    messagesLiveRef.current = messages;
  }, [transcript, messages]);

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

  // PartyKit phase wins for interview/review; skip setup when interview already started.
  const activeStep: Step =
    phase === "review"
      ? "review"
      : step === "setup" && phase === "interview"
        ? "interview"
        : step;

  // Background speech analysis: only the designated host triggers the API (avoids duplicate calls per interviewer).
  // Other interviewers still receive `transcript-analysis` over PartyKit and see the same panel.
  useEffect(() => {
    if (activeStep !== "interview") return;
    if (!participant || !isHost) return;

    const current = transcriptLiveRef.current;
    const startIdx = lastAnalyzedTranscriptLenRef.current;
    const slice = current.slice(startIdx);
    const windowText = slice
      .slice(-40)
      .map((e) => `${e.speaker}: ${e.text}`)
      .join("\n")
      .trim();

    if (windowText.length < TRANSCRIPT_ANALYSIS_GATE_CHARS && slice.length < TRANSCRIPT_ANALYSIS_GATE_LINES) {
      return;
    }

    if (analyzeDebounceRef.current) clearTimeout(analyzeDebounceRef.current);
    analyzeDebounceRef.current = setTimeout(async () => {
      analyzeDebounceRef.current = null;
      if (analyzeInFlightRef.current) return;

      const t = transcriptLiveRef.current;
      const si = lastAnalyzedTranscriptLenRef.current;
      const sl = t.slice(si);
      const wt = sl
        .slice(-40)
        .map((e) => `${e.speaker}: ${e.text}`)
        .join("\n")
        .trim();
      if (wt.length < TRANSCRIPT_ANALYSIS_MIN_CHARS) return;

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
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          summary?: string;
          score?: number;
          answerQuality?: string;
        };
        if (!res.ok || data.error || typeof data.summary !== "string") return;

        const allowed = new Set(["strong", "adequate", "weak", "insufficient", "n/a"]);
        const answerQuality = allowed.has(String(data.answerQuality))
          ? (data.answerQuality as "strong" | "adequate" | "weak" | "insufficient" | "n/a")
          : "n/a";
        const score =
          typeof data.score === "number" && data.score >= 0 && data.score <= 10 ? data.score : 0;
        const endLen = transcriptLiveRef.current.length;

        sendTranscriptAnalysis({
          id: `ta-${Date.now()}`,
          timestamp: Date.now(),
          transcriptEndLength: endLen,
          summary: data.summary,
          score,
          answerQuality,
        });
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

  const handleTranscriptSegment = useCallback((text: string) => {
    if (participant) {
      sendTranscript(text, participant.name);
    }
  }, [participant, sendTranscript]);

  const {
    isRecording,
    isSupported: speechSupported,
    speechNotice,
    interimText,
    startRecording,
    stopRecording,
  } = useSpeechTranscription({ onTranscript: handleTranscriptSegment });

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

    if (!greetingSentRef.current) {
      greetingSentRef.current = true;
      try {
        setAgentTyping(true);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "candidate", content: "[Interview session started. Please introduce yourself and begin the interview.]" }],
            config: resolveAgentApiConfig(config),
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
        console.error("Greeting error:", err);
      } finally {
        setAgentTyping(false);
      }
    }
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

    // Both interviewer and candidate can chat with the agent.
    setAgentTyping(true);
    try {
      const cfg = roomConfig;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, msg].map((m) => ({
            role: m.role === "agent" ? "agent" : "candidate",
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
            role: m.role === "agent" ? "agent" : "candidate",
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

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const configuredRole = roomConfig?.role || "Frontend Developer";
  const availableQuestions: PredefinedQuestion[] = PREDEFINED_QUESTIONS[configuredRole] || [];
  const availableTasks: CodingTaskPreset[] = [
    ...(CODING_TASK_PRESETS["General"] || []),
    ...(CODING_TASK_PRESETS[configuredRole] || []),
  ];

  const handleAssignTask = useCallback((task: CodingTaskPreset) => {
    sendCodingTask({ title: task.title, description: task.description, language: task.language, starterCode: task.starterCode });
  }, [sendCodingTask]);

  const handleSendQuestion = useCallback((question: string) => {
    if (!participant) return;
    const msg = {
      id: `msg-${Date.now()}`,
      role: "user" as const,
      content: question,
      senderName: participant.name,
      timestamp: Date.now(),
    };
    sendChat(msg);
  }, [participant, sendChat]);

  const runReportGeneration = useCallback(async () => {
    setReportGenerating(true);
    try {
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
          })),
          transcript,
          transcriptAnalyses,
          config: roomConfig,
          codingTask,
        }),
      });
      const data = (await res.json()) as { error?: string; markdown?: string };
      if (!res.ok || typeof data.markdown !== "string" || !data.markdown.trim()) {
        sendInterviewReport({
          markdown: `## Summary unavailable\n\n${data?.error || "The model did not return a report."}\n`,
          generatedAt: Date.now(),
        });
        return;
      }
      sendInterviewReport({ markdown: data.markdown.trim(), generatedAt: Date.now() });
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
    roomCode,
    participants,
    messages,
    transcript,
    transcriptAnalyses,
    roomConfig,
    codingTask,
    sendInterviewReport,
  ]);

  const handleEndInterview = useCallback(async () => {
    if (!isHost) return;
    if (
      !window.confirm(
        "End the interview for everyone in this room and generate an AI summary? Participants will move to the final summary page."
      )
    ) {
      return;
    }
    if (isRecording) stopRecording();
    sendPhase("review");
    setStep("review");
    if (interviewReport) return;
    await runReportGeneration();
  }, [isHost, sendPhase, interviewReport, runReportGeneration, isRecording, stopRecording]);

  // ─── Step 1: Join ──────────────────────────────────────────────
  if (activeStep === "join") {
    return (
      <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Join Interview Room</CardTitle>
            <CardDescription>
              Room: <span className="font-mono font-bold text-blue-600">{roomCode}</span>
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

              <Button type="submit" className="w-full" disabled={!name.trim()}>
                Join room
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
          title="Room Setup"
          subtitle={`Configure the interview · Room: ${roomCode}`}
        />
      );
    }

    const waitingMessage =
      participant?.role === "interviewer"
        ? "Another interviewer joined first and is configuring this room. You'll move to the interview as soon as they start."
        : "Waiting for the interviewer to configure and start the session...";

    return (
      <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Waiting Room</CardTitle>
            <CardDescription>
              Room: <span className="font-mono font-bold text-blue-600">{roomCode}</span>
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
                      {hostParticipantId === p.id && " · host"}
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
              <CardTitle className="text-xl">Thanks for participating</CardTitle>
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
        report={interviewReport}
        generating={reportGenerating}
        role={participant?.role ?? "interviewer"}
        onRetryReport={isHost ? runReportGeneration : undefined}
      />
    );
  }

  // ─── Step 3: Interview Room ────────────────────────────────────

  // ── Candidate view: chat + code editor ──
  if (participant?.role === "candidate") {
    return (
      <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-blue-600">{roomCode}</span>
            <Badge variant="secondary" className="text-xs">Interview in progress</Badge>
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Wifi className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-500">
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
          <div className="w-80 min-w-72 flex flex-col border-r border-zinc-200 dark:border-zinc-800 min-h-0">
            <div className="flex-none flex flex-col border-b border-zinc-200 dark:border-zinc-800 max-h-[36vh] min-h-[128px] shrink-0 bg-zinc-50/80 dark:bg-zinc-900/40">
              <div className="px-3 py-2 flex items-center gap-1.5 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
                <Mic className={`h-3.5 w-3.5 shrink-0 ${isRecording ? "text-red-500 animate-pulse" : "text-zinc-400"}`} />
                <span className="text-xs font-medium">Live transcript</span>
                {isRecording && <span className="text-[10px] text-red-500">● REC</span>}
                <span className="text-[10px] text-zinc-500 ml-auto">Room</span>
              </div>
              <div className="flex-1 min-h-[72px] max-h-[32vh] overflow-y-auto p-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                {transcript.length === 0 && !interimText ? (
                  <p className="text-zinc-400 italic leading-relaxed">
                    When anyone records, speech shows here for everyone.
                  </p>
                ) : (
                  transcript.slice(-30).map((entry, i) => (
                    <div key={`${entry.timestamp}-${i}-${entry.text.slice(0, 12)}`}>
                      <span className="font-medium">{entry.speaker}:</span> {entry.text}
                    </div>
                  ))
                )}
                {interimText && (
                  <div className="text-zinc-400 italic">
                    <span className="font-medium">{participant?.name}:</span> {interimText}…
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-zinc-400 mt-8">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet.</p>
                    <p className="mt-1 text-xs">The interview will begin shortly</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.role === "agent" ? "items-start" : "items-end"}`}
                    >
                      <div className="text-xs text-zinc-500 mb-0.5">{msg.senderName}</div>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "agent"
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {agentTyping && (
                  <div className="flex flex-col items-start">
                    <div className="text-xs text-zinc-500 mb-0.5">AI Agent</div>
                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500">
                      Thinking...
                    </div>
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
                    placeholder="Type your answer..."
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button size="sm" onClick={handleSendMessage} disabled={!chatInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <CollaborativeEditor
              roomId={roomCode}
              participantName={participant?.name || "Anonymous"}
              participantRole="candidate"
              language={(codingTask as { language?: string })?.language || "javascript"}
              taskTitle={(codingTask as { title?: string })?.title}
              taskDescription={(codingTask as { description?: string })?.description}
              starterCode={(codingTask as { starterCode?: string })?.starterCode}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Interviewer view ──
  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
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
          {isHost && (
            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Host
            </Badge>
          )}
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Wifi className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-500">
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
          <Button
            variant={showTasksPanel ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTasksPanel(!showTasksPanel)}
            title="Toggle questions & tasks panel"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Q&A
          </Button>
          {phase === "interview" && (codingTask as { title?: string } | null)?.title && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-violet-300 text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-950/50"
              onClick={handleSubmitCodingForReview}
              disabled={agentTyping}
              title="Send the shared editor (candidate's current work) to the AI for feedback"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Review candidate code
            </Button>
          )}
          {isHost && phase === "interview" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
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
        <div className="w-95 min-w-80 flex flex-col border-r border-zinc-200 dark:border-zinc-800 min-h-0">
          <div className="flex-none flex flex-col border-b border-zinc-200 dark:border-zinc-800 max-h-[30vh] min-h-[112px] shrink-0 bg-zinc-50/80 dark:bg-zinc-900/40">
            <div className="px-3 py-2 flex items-center gap-1.5 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
              <Mic className={`h-3.5 w-3.5 shrink-0 ${isRecording ? "text-red-500 animate-pulse" : "text-zinc-400"}`} />
              <span className="text-xs font-medium">Live transcript</span>
              {isRecording && <span className="text-[10px] text-red-500">● REC</span>}
              <span className="text-[10px] text-zinc-500 ml-auto">Room</span>
            </div>
            <div className="flex-1 min-h-[72px] max-h-[26vh] overflow-y-auto p-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {transcript.length === 0 && !interimText ? (
                <p className="text-zinc-400 italic leading-relaxed">
                  Final lines appear here as people record. Interim text updates while someone is speaking.
                </p>
              ) : (
                transcript.slice(-30).map((entry, i) => (
                  <div key={`${entry.timestamp}-${i}-${entry.text.slice(0, 12)}`}>
                    <span className="font-medium">{entry.speaker}:</span> {entry.text}
                  </div>
                ))
              )}
              {interimText && (
                <div className="text-zinc-400 italic">
                  <span className="font-medium">{participant?.name}:</span> {interimText}…
                </div>
              )}
            </div>
          </div>

          <div className="flex-none flex flex-col border-b border-zinc-200 dark:border-zinc-800 max-h-[32vh] min-h-[100px] shrink-0 bg-violet-50/80 dark:bg-violet-950/30">
            <div className="px-3 py-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 shrink-0 border-b border-violet-200/80 dark:border-violet-900/60">
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
              <span className="text-xs font-medium text-violet-900 dark:text-violet-100">Answer insights (speech)</span>
              <span className="text-[10px] text-violet-700/80 dark:text-violet-300/80">Not shown to candidate</span>
              {analysisBusy && (
                <span className="text-[10px] text-violet-600 dark:text-violet-400 ml-auto animate-pulse">Analyzing…</span>
              )}
            </div>
            <div className="flex-1 min-h-[72px] max-h-[28vh] overflow-y-auto p-3 space-y-2">
              {transcriptAnalyses.length === 0 && !analysisBusy ? (
                <p className="text-xs text-violet-800/75 dark:text-violet-200/75 italic leading-relaxed">
                  When the host records, recent speech is analyzed here (summary, score, answer quality) to help you steer the interview.
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
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="text-center text-sm text-zinc-400 mt-8">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No messages yet.</p>
                  <p className="mt-1 text-xs">Send a message to start the interview conversation</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "agent" ? "items-start" : "items-end"}`}
                  >
                    <div className="text-xs text-zinc-500 mb-0.5">{msg.senderName}</div>
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "agent"
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      {msg.content}
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
                  placeholder="Type a message (sends to AI agent)..."
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button size="sm" onClick={handleSendMessage} disabled={!chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {showTasksPanel && (
          <div className="w-75 min-w-65 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
            <div className="border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setExpandedSection(expandedSection === "questions" ? null : "questions")}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                {expandedSection === "questions" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                Questions ({availableQuestions.length})
              </button>
              {expandedSection === "questions" && (
                <div className="px-3 pb-3 space-y-1.5">
                  {availableQuestions.length === 0 ? (
                    <p className="text-xs text-zinc-400 px-1">No questions available for this role.</p>
                  ) : (
                    availableQuestions.map((q) => (
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
                            onClick={() => handleSendQuestion(q.question)}
                            title="Send this question to chat"
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <button
                onClick={() => setExpandedSection(expandedSection === "tasks" ? null : "tasks")}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                {expandedSection === "tasks" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Code2 className="h-3.5 w-3.5 text-green-500" />
                Coding Tasks ({availableTasks.length})
              </button>
              {expandedSection === "tasks" && (
                <div className="px-3 pb-3 space-y-1.5">
                  {availableTasks.length === 0 ? (
                    <p className="text-xs text-zinc-400 px-1">No coding tasks available.</p>
                  ) : (
                    availableTasks.map((task) => (
                      <div key={task.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 p-2.5 hover:border-green-300 dark:hover:border-green-800 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{task.title}</span>
                              <Badge variant="secondary" className="text-[10px]">{task.language}</Badge>
                              {task.difficulty && <Badge variant="secondary" className="text-[10px] capitalize">{task.difficulty}</Badge>}
                            </div>
                            <p className="text-[11px] text-zinc-500 line-clamp-2">{task.description}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 px-2 text-[10px]"
                            onClick={() => handleAssignTask(task)}
                            title="Assign this task to the editor"
                          >
                            Assign
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          <CollaborativeEditor
            ref={panelCodingEditorRef}
            roomId={roomCode}
            participantName={participant?.name || "Anonymous"}
            participantRole="interviewer"
            isSeeder={isHost}
            language={(codingTask as { language?: string })?.language || "javascript"}
            taskTitle={(codingTask as { title?: string })?.title}
            taskDescription={(codingTask as { description?: string })?.description}
            starterCode={(codingTask as { starterCode?: string })?.starterCode}
          />
        </div>
      </div>
    </div>
  );
}
