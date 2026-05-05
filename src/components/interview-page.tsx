"use client";

import React, { useState } from "react";
import { useInterviewStore } from "@/store/interview-store";
import { ChatPanel } from "@/components/chat-panel";
import { CodeEditor } from "@/components/code-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Code2,
  Clock,
  User,
  Briefcase,
  GripVertical,
  Maximize2,
  Minimize2,
} from "lucide-react";

function InterviewTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <span className="font-mono text-sm">
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

export function InterviewPage() {
  const session = useInterviewStore((s) => s.session);
  const [activePanel, setActivePanel] = useState<"chat" | "code">("chat");
  const [splitRatio, setSplitRatio] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!session) return null;

  const toggleFullscreen = () => {
    if (isFullscreen) {
      setSplitRatio(50);
    } else {
      setSplitRatio(activePanel === "chat" ? 100 : 0);
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top Bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-sm bg-linear-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
            Interview Copilot
          </h1>
          <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <User className="h-3 w-3" />
            <span>{session.config.intervieweeName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Briefcase className="h-3 w-3" />
            <span>{session.config.role}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {session.config.difficulty}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            <InterviewTimer startedAt={session.startedAt} />
          </div>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <button
          onClick={() => setActivePanel("chat")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            activePanel === "chat"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-zinc-500"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
          {session.messages.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {session.messages.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActivePanel("code")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            activePanel === "code"
              ? "text-violet-600 border-b-2 border-violet-600"
              : "text-zinc-500"
          }`}
        >
          <Code2 className="h-4 w-4" />
          Code
          {session.codingTasks.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {session.codingTasks.length}
            </Badge>
          )}
        </button>
      </div>

      {/* Split View (Desktop) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div
          className={`${
            activePanel === "chat" ? "flex" : "hidden"
          } md:flex flex-col border-r border-zinc-200 dark:border-zinc-800 overflow-hidden`}
          style={{ width: `${splitRatio}%` }}
        >
          <ChatPanel />
        </div>

        {/* Resize Handle (Desktop) */}
        <div className="hidden md:flex items-center w-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-blue-400 dark:hover:bg-blue-600 cursor-col-resize transition-colors group relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <GripVertical className="h-4 w-4 text-zinc-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="absolute top-2 right-0 translate-x-full z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        {/* Code Editor Panel */}
        <div
          className={`${
            activePanel === "code" ? "flex" : "hidden"
          } md:flex flex-col overflow-hidden`}
          style={{ width: `${100 - splitRatio}%` }}
        >
          <CodeEditor />
        </div>
      </div>
    </div>
  );
}
