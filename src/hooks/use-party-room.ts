"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { Participant, RoomState, RoomMessage, ChatMessage, TranscriptEntry } from "@/types/room";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

export function usePartyRoom(roomId: string | null, participant: Participant | null) {
  const socketRef = useRef<PartySocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [phase, setPhase] = useState<RoomState["phase"]>("setup");
  const [config, setConfig] = useState<unknown | null>(null);
  const [codingTask, setCodingTask] = useState<unknown | null>(null);

  useEffect(() => {
    if (!roomId || !participant) return;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    });

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      // Announce ourselves to the room
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
        case "transcript":
          setTranscript((prev) => [
            ...prev,
            { text: data.text, speaker: data.speaker, timestamp: data.timestamp },
          ]);
          break;
        case "sync-response":
          setParticipants(data.state.participants);
          setMessages(data.state.messages);
          setTranscript(data.state.transcript);
          setPhase(data.state.phase);
          setConfig(data.state.config);
          setCodingTask(data.state.codingTask);
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
    setCodingTask(task);
    socketRef.current.send(JSON.stringify({ type: "coding-task", task } satisfies RoomMessage));
  }, []);

  const sendTranscript = useCallback((text: string, speaker: string) => {
    if (!socketRef.current) return;
    const entry = { text, speaker, timestamp: Date.now() };
    setTranscript((prev) => [...prev, entry]);
    socketRef.current.send(
      JSON.stringify({ type: "transcript", ...entry } satisfies RoomMessage)
    );
  }, []);

  return {
    connected,
    participants,
    messages,
    transcript,
    phase,
    config,
    codingTask,
    sendChat,
    sendAgentResponse,
    sendConfig,
    sendPhase,
    sendCodingTask,
    sendTranscript,
  };
}
