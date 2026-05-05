"use client";

import React, { useCallback } from "react";
import Editor from "@monaco-editor/react";
import { useInterviewStore } from "@/store/interview-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Code2, Send, FileCode } from "lucide-react";

export function CodeEditor() {
  const session = useInterviewStore((s) => s.session);
  const updateCurrentCode = useInterviewStore((s) => s.updateCurrentCode);
  const submitCode = useInterviewStore((s) => s.submitCode);
  const addMessage = useInterviewStore((s) => s.addMessage);

  const currentTask =
    session && session.currentTaskIndex >= 0
      ? session.codingTasks[session.currentTaskIndex]
      : null;

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateCurrentCode(value);
      }
    },
    [updateCurrentCode]
  );

  const handleSubmitCode = () => {
    if (!currentTask) return;
    const code = currentTask.submittedCode || currentTask.starterCode;
    submitCode(code);
    addMessage(
      "interviewee",
      `I've completed the coding task "${currentTask.title}". Here's my solution:\n\n\`\`\`${currentTask.language}\n${code}\n\`\`\``
    );
  };

  if (!currentTask) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-50 dark:bg-zinc-900 text-zinc-400">
        <Code2 className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">No coding task assigned yet</p>
        <p className="text-sm">The interviewer will assign a coding task during the interview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Task Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-violet-600" />
            <h3 className="font-semibold text-sm">{currentTask.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{currentTask.language}</Badge>
            <Button size="sm" variant="success" onClick={handleSubmitCode}>
              <Send className="h-3 w-3" />
              Submit Code
            </Button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {currentTask.description}
        </p>
      </div>

      {/* Task Tabs (if multiple tasks) */}
      {session && session.codingTasks.length > 1 && (
        <div className="flex gap-1 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-x-auto">
          {session.codingTasks.map((task, idx) => (
            <Badge
              key={task.id}
              variant={idx === session.currentTaskIndex ? "default" : "secondary"}
              className="cursor-pointer whitespace-nowrap text-xs"
            >
              Task {idx + 1}: {task.title}
            </Badge>
          ))}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={currentTask.language}
          value={currentTask.submittedCode || currentTask.starterCode}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
            tabSize: 2,
            wordWrap: "on",
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
          }}
        />
      </div>

      {/* Submitted indicator */}
      {currentTask.submittedAt && (
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs">
          Code submitted at {new Date(currentTask.submittedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
