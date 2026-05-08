"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import { transcriptionTrace } from "@/lib/transcription-trace";
import type {
  Participant,
  RoomState,
  RoomMessage,
  ChatMessage,
  TranscriptEntry,
  TranscriptAnalysisEntry,
  InterviewReport,
} from "@/types/room";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

export function usePartyRoom(roomId: string | null, participant: Participant | null) {
  const socketRef = useRef<PartySocket | null>(null);
  const participantRoleRef = useRef<Participant["role"] | null>(null);

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [transcriptAnalyses, setTranscriptAnalyses] = useState<TranscriptAnalysisEntry[]>([]);
  const [phase, setPhase] = useState<RoomState["phase"]>("setup");
  const [config, setConfig] = useState<unknown | null>(null);
  const [codingTask, setCodingTask] = useState<unknown | null>(null);
  const [interviewReport, setInterviewReport] = useState<InterviewReport | null>(null);
  /** First interviewer (server-elected); only the host renders the SetupForm. */
  const [hostParticipantId, setHostParticipantId] = useState<string | null>(null);

  useEffect(() => {
    participantRoleRef.current = participant?.role ?? null;
  }, [participant?.role]);

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
        case "phase":
          setPhase(data.phase as RoomState["phase"]);
          break;
        case "coding-task":
          setCodingTask(data.task);
          break;
        case "transcript": {
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
            { text: data.text, speaker: data.speaker, timestamp: data.timestamp },
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
        case "sync-response":
          transcriptionTrace("socket ← sync-response", {
            participants: data.state.participants.length,
            messages: data.state.messages.length,
            transcriptLines: data.state.transcript.length,
            analyses: (data.state.transcriptAnalyses ?? []).length,
            host: data.state.hostParticipantId,
          });
          setParticipants(data.state.participants);
          setMessages(data.state.messages);
          setTranscript(data.state.transcript);
          setPhase(data.state.phase);
          setConfig(data.state.config);
          setCodingTask(data.state.codingTask);
          setHostParticipantId(data.state.hostParticipantId);
          setTranscriptAnalyses(
            participantRoleRef.current !== "interviewer"
              ? []
              : (data.state.transcriptAnalyses ?? [])
          );
          setInterviewReport(
            participantRoleRef.current !== "interviewer"
              ? null
              : (data.state.interviewReport ?? null)
          );
          break;
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
  }, [roomId, participant]);

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
    setPhase(p as RoomState["phase"]);
    socketRef.current.send(JSON.stringify({ type: "phase", phase: p } satisfies RoomMessage));
  }, []);

  const sendCodingTask = useCallback((task: unknown) => {
    if (!socketRef.current) return;
    // State updates from the server's broadcast only so `collaborationTaskId` matches all clients.
    socketRef.current.send(JSON.stringify({ type: "coding-task", task } satisfies RoomMessage));
  }, []);

  const sendTranscript = useCallback((text: string, speaker: string) => {
    const entry = { text, speaker, timestamp: Date.now() };
    const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    transcriptionTrace("sendTranscript (local + optional wire)", {
      speaker,
      chars: text.length,
      preview,
      socketOpen: Boolean(socketRef.current),
    });
    setTranscript((prev) => [...prev, entry]);
    if (!socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({ type: "transcript", ...entry } satisfies RoomMessage)
    );
  }, []);

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
    interviewReport,
    hostParticipantId,
    sendChat,
    sendAgentResponse,
    sendConfig,
    sendPhase,
    sendCodingTask,
    sendTranscript,
    sendTranscriptAnalysis,
    sendInterviewReport,
  };
}
