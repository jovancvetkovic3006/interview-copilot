"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { usePartyRoom } from "@/hooks/use-party-room";
import { useSpeechTranscription } from "@/hooks/use-speech-transcription";
import type { Participant } from "@/types/room";
import type { InterviewConfig } from "@/types/interview";
import type { CodingTaskPreset, PredefinedQuestion } from "@/types/interview";
import { PREDEFINED_QUESTIONS, CODING_TASK_PRESETS } from "@/data/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { SetupForm } from "@/components/setup-form";
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
} from "lucide-react";

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

type Step = "join" | "setup" | "interview";

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomCode = params.code as string;
  const isCreator = searchParams.get("creator") === "1";

  // Local step state machine: join → setup → interview
  const [step, setStep] = useState<Step>("join");

  const [name, setName] = useState("");
  const [role, setRole] = useState<Participant["role"]>(isCreator ? "interviewer" : "interviewee");
  const [copied, setCopied] = useState(false);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [showTasksPanel, setShowTasksPanel] = useState(true);
  const [expandedSection, setExpandedSection] = useState<"questions" | "tasks" | null>("tasks");
  const idRef = useRef(generateId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const greetingSentRef = useRef(false);

  // Interview config (set by SetupForm during setup step)
  const [roomConfig, setRoomConfig] = useState<InterviewConfig | null>(null);

  const {
    connected,
    participants,
    messages,
    transcript,
    phase,
    codingTask,
    sendChat,
    sendAgentResponse,
    sendTranscript,
    sendPhase,
    sendConfig,
    sendCodingTask,
  } = usePartyRoom(step !== "join" ? roomCode : null, participant);

  // Auto-scroll chat to bottom when new messages arrive or agent typing changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentTyping]);

  // Derive the active step: if PartyKit says interview already started
  // (e.g. another participant's interviewer clicked Start), skip setup.
  const activeStep: Step = (step === "setup" && phase === "interview") ? "interview" : step;

  const handleTranscriptSegment = useCallback((text: string) => {
    if (participant) {
      sendTranscript(text, participant.name);
    }
  }, [participant, sendTranscript]);

  const {
    isRecording,
    isSupported: speechSupported,
    interimText,
    startRecording,
    stopRecording,
  } = useSpeechTranscription({ onTranscript: handleTranscriptSegment });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setParticipant({
        id: idRef.current,
        name: name.trim(),
        role,
        joinedAt: Date.now(),
      });
      setStep("setup");
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSetupComplete = async (config: InterviewConfig) => {
    setRoomConfig(config);
    sendConfig(config);
    sendPhase("interview");
    setStep("interview");

    // Send AI greeting message
    if (!greetingSentRef.current) {
      greetingSentRef.current = true;
      try {
        setAgentTyping(true);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "interviewee", content: "[Interview session started. Please introduce yourself and begin the interview.]" }],
            config: {
              role: config.role,
              difficulty: config.difficulty,
              topics: config.topics,
              intervieweeName: config.intervieweeName || participants.find((p) => p.role === "interviewee")?.name || "Candidate",
              agentInstructions: config.agentInstructions,
              selectedQuestions: config.selectedQuestions,
              selectedCodingTasks: config.selectedCodingTasks,
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

    // Forward to AI agent (both interviewer and interviewee can chat with the agent)
    if (participant.role === "interviewer" || participant.role === "interviewee") {
      setAgentTyping(true);
      try {
        const cfg = roomConfig;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, msg].map((m) => ({
              role: m.role === "agent" ? "agent" : "interviewee",
              content: m.content,
            })),
            config: {
              role: cfg?.role || "Software Developer",
              difficulty: cfg?.difficulty || "mid",
              topics: cfg?.topics || ["general"],
              intervieweeName: cfg?.intervieweeName || participants.find((p) => p.role === "interviewee")?.name || participant.name || "Candidate",
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
        console.error("Agent error:", err);
      } finally {
        setAgentTyping(false);
      }
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Helper: get available questions for the configured role
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

              <div>
                <label className="block text-sm font-medium mb-1.5">Your Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["interviewer", "interviewee", "observer"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`p-2.5 rounded-lg border text-sm font-medium capitalize transition-all cursor-pointer ${
                        role === r
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={!name.trim()}>
                Join Room
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Step 2: Setup / Waiting Room ──────────────────────────────
  if (activeStep === "setup") {
    // Interviewer sees the full setup form
    if (participant?.role === "interviewer") {
      return (
        <SetupForm
          onStart={handleSetupComplete}
          title="Room Setup"
          subtitle={`Configure the interview · Room: ${roomCode}`}
        />
      );
    }

    // Non-interviewers see a waiting room
    return (
      <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Waiting Room</CardTitle>
            <CardDescription>
              Room: <span className="font-mono font-bold text-blue-600">{roomCode}</span>
              <Button variant="ghost" size="sm" onClick={handleCopyLink} className="ml-2">
                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
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
                          : p.role === "interviewee"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : ""
                      }`}
                    >
                      {p.role}
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
              <p className="text-sm text-zinc-500">Waiting for the interviewer to configure and start the session...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Step 3: Interview Room ────────────────────────────────────

  // ── Interviewee view: chat + code editor ──
  if (participant?.role === "interviewee") {
    return (
      <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        {/* Top bar */}
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
              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isRecording ? "Stop" : "Record"}
              </Button>
            )}
          </div>
        </div>

        {/* Main content: chat + code editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat panel */}
          <div className="w-80 min-w-72 flex flex-col border-r border-zinc-200 dark:border-zinc-800">
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                    className={`flex flex-col ${
                      msg.role === "agent" ? "items-start" : "items-end"
                    }`}
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

            {/* Chat input */}
            <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
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

          {/* Right: Code editor */}
          <div className="flex-1 flex flex-col">
            <CollaborativeEditor
              roomId={roomCode}
              participantName={participant?.name || "Anonymous"}
              participantRole={participant?.role || "observer"}
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

  // ── Interviewer / Observer view ──
  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-blue-600">{roomCode}</span>
          <Button variant="ghost" size="sm" onClick={handleCopyLink} title="Copy room link">
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Badge variant="secondary" className="text-xs capitalize">{phase}</Badge>
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
                title={`${p.name} (${p.role})`}
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-950 ${
                  p.role === "interviewer"
                    ? "bg-purple-500"
                    : p.role === "interviewee"
                      ? "bg-blue-500"
                      : "bg-zinc-400"
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
          {participant?.role === "interviewer" && (
            <Button
              variant={showTasksPanel ? "default" : "outline"}
              size="sm"
              onClick={() => setShowTasksPanel(!showTasksPanel)}
              title="Toggle questions & tasks panel"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Q&A
            </Button>
          )}
          {speechSupported && participant?.role !== "observer" && (
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              onClick={isRecording ? stopRecording : startRecording}
              title={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {isRecording ? "Stop" : "Record"}
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat + Transcript */}
        <div className="w-95 min-w-80 flex flex-col border-r border-zinc-200 dark:border-zinc-800">
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                  className={`flex flex-col ${
                    msg.role === "agent" ? "items-start" : "items-end"
                  }`}
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

          {/* Chat input */}
          {participant?.role !== "observer" && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder={participant?.role === "interviewer" ? "Type a message (sends to AI agent)..." : "Type a message..."}
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button size="sm" onClick={handleSendMessage} disabled={!chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Transcript section */}
          {(transcript.length > 0 || isRecording) && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-40 overflow-y-auto">
              <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-900 flex items-center gap-1.5">
                <Mic className={`h-3 w-3 ${isRecording ? "text-red-500 animate-pulse" : "text-zinc-400"}`} />
                <span className="text-xs font-medium">Live Transcript</span>
                {isRecording && <span className="text-xs text-red-500 ml-1">● REC</span>}
              </div>
              <div className="p-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                {transcript.slice(-20).map((entry, i) => (
                  <div key={i}>
                    <span className="font-medium">{entry.speaker}:</span> {entry.text}
                  </div>
                ))}
                {interimText && (
                  <div className="text-zinc-400 italic">
                    <span className="font-medium">{participant?.name}:</span> {interimText}...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Middle: Questions & Tasks Panel (interviewer only, togglable) */}
        {showTasksPanel && participant?.role === "interviewer" && (
          <div className="w-75 min-w-65 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-y-auto">
            {/* Questions section */}
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

            {/* Coding Tasks section */}
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

        {/* Right: Collaborative Code Editor */}
        <div className="flex-1 flex flex-col">
          <CollaborativeEditor
            roomId={roomCode}
            participantName={participant?.name || "Anonymous"}
            participantRole={participant?.role || "observer"}
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
