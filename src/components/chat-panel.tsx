"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useInterviewStore } from "@/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Loader2, StickyNote, Plus } from "lucide-react";
import type { CodingTask, InterviewNote } from "@/types/interview";

function parseCodingTask(content: string): { cleanContent: string; task: Omit<CodingTask, "id" | "assignedAt"> | null } {
  const taskRegex = /\[CODING_TASK\]([\s\S]*?)\[\/CODING_TASK\]/;
  const match = content.match(taskRegex);

  if (match) {
    try {
      const taskData = JSON.parse(match[1]);
      const cleanContent = content.replace(taskRegex, "").trim();
      return {
        cleanContent,
        task: {
          title: taskData.title,
          description: taskData.description,
          starterCode: taskData.starterCode,
          language: taskData.language || "javascript",
        },
      };
    } catch {
      return { cleanContent: content, task: null };
    }
  }

  return { cleanContent: content, task: null };
}

export function ChatPanel() {
  const session = useInterviewStore((s) => s.session);
  const isAgentTyping = useInterviewStore((s) => s.isAgentTyping);
  const addMessage = useInterviewStore((s) => s.addMessage);
  const assignCodingTask = useInterviewStore((s) => s.assignCodingTask);
  const setAgentTyping = useInterviewStore((s) => s.setAgentTyping);
  const addNote = useInterviewStore((s) => s.addNote);
  const endSession = useInterviewStore((s) => s.endSession);
  const setGeneratingReview = useInterviewStore((s) => s.setGeneratingReview);
  const setReview = useInterviewStore((s) => s.setReview);

  const [input, setInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteCategory, setNoteCategory] = useState<InterviewNote["category"]>("general");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, isAgentTyping]);

  const generateReview = useCallback(async () => {
    if (!session) return;

    setGeneratingReview(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-review",
          messages: session.messages,
          config: session.config,
          codingTasks: session.codingTasks,
          notes: session.notes,
        }),
      });

      const data = await res.json();
      if (data.review) {
        setReview(data.review);
      }
    } catch (err) {
      console.error("Failed to generate review:", err);
    } finally {
      setGeneratingReview(false);
    }
  }, [session, setGeneratingReview, setReview]);

  const sendToAgent = useCallback(async (messages: { role: string; content: string }[]) => {
    if (!session) return;

    setAgentTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          config: session.config,
        }),
      });

      const data = await res.json();

      if (data.error) {
        addMessage("agent", `Error: ${data.error}. Please make sure your OPENAI_API_KEY is set in .env.local`);
        setAgentTyping(false);
        return;
      }

      const { cleanContent, task } = parseCodingTask(data.content);

      if (data.content.includes("[INTERVIEW_COMPLETE]")) {
        const finalContent = cleanContent.replace("[INTERVIEW_COMPLETE]", "").trim();
        if (finalContent) addMessage("agent", finalContent);
        endSession();
        await generateReview();
        return;
      }

      if (cleanContent) {
        addMessage("agent", cleanContent);
      }

      if (task) {
        assignCodingTask(task);
        addNote("coding", `Coding task assigned: ${task.title}`);
      }
    } catch (err) {
      addMessage("agent", "Sorry, I encountered an error. Please check your API configuration.");
      console.error(err);
    } finally {
      setAgentTyping(false);
    }
  }, [session, setAgentTyping, addMessage, endSession, assignCodingTask, addNote, generateReview]);

  // Start the interview with an initial greeting
  useEffect(() => {
    if (session && session.messages.length === 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      sendToAgent([
        {
          role: "interviewee",
          content: `Hi, I'm ${session.config.intervieweeName}. I'm here for the ${session.config.role} interview.`,
        },
      ]);
    }
  }, [session, sendToAgent]);

  const handleSend = () => {
    if (!input.trim() || isAgentTyping || !session) return;

    const userMessage = input.trim();
    addMessage("interviewee", userMessage);
    setInput("");

    const allMessages = [
      ...session.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "interviewee", content: userMessage },
    ];

    sendToAgent(allMessages);
  };

  const handleAddNote = () => {
    if (!noteInput.trim()) return;
    addNote(noteCategory, noteInput.trim());
    setNoteInput("");
    setShowNoteInput(false);
  };

  const handleEndInterview = async () => {
    if (!session) return;
    endSession();
    await generateReview();
  };

  if (!session) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-sm">Interview Agent</span>
          <Badge variant="secondary" className="text-xs">
            {session.config.difficulty}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNoteInput(!showNoteInput)}
            title="Add Note"
          >
            <StickyNote className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEndInterview}
          >
            End Interview
          </Button>
        </div>
      </div>

      {/* Note Input */}
      {showNoteInput && (
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-amber-50 dark:bg-amber-950">
          <div className="flex gap-2 mb-2">
            {(["general", "strength", "weakness", "question", "coding"] as const).map((cat) => (
              <Badge
                key={cat}
                variant={noteCategory === cat ? "default" : "secondary"}
                className="cursor-pointer capitalize text-xs"
                onClick={() => setNoteCategory(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              placeholder="Add a note about the interviewee..."
              className="flex-1 h-8 px-3 rounded-md border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-zinc-900"
            />
            <Button size="sm" variant="default" onClick={handleAddNote}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "interviewee" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                msg.role === "agent"
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300"
              }`}
            >
              {msg.role === "agent" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "agent"
                  ? "bg-zinc-100 dark:bg-zinc-900"
                  : "bg-blue-600 text-white"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <div
                className={`text-xs mt-1 ${
                  msg.role === "agent" ? "text-zinc-400" : "text-blue-200"
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isAgentTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Bot className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-xl px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type your response..."
            disabled={isAgentTyping}
            className="flex-1 h-10 px-4 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <Button onClick={handleSend} disabled={isAgentTyping || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
