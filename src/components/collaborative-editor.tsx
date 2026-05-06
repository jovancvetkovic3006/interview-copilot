"use client";

import React, { useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import * as Y from "yjs";
// y-monaco and y-partykit/provider are imported dynamically in handleEditorMount
// because they access `window` at module level, which breaks SSR.
import { Badge } from "@/components/ui/badge";
import { Code2, FileCode, Users } from "lucide-react";
import type { editor } from "monaco-editor";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

interface CollaborativeEditorProps {
  roomId: string;
  participantName: string;
  participantRole: "interviewer" | "interviewee" | "observer";
  language?: string;
  taskTitle?: string;
  taskDescription?: string;
  starterCode?: string;
}

function buildCommentPrefix(lang: string): { start?: string; end?: string; line: string } {
  switch (lang) {
    case "python":
    case "yaml":
    case "ruby":
      return { line: "#" };
    case "sql":
      return { line: "--" };
    case "html":
    case "xml":
      return { start: "<!--", end: "-->" , line: "" };
    case "css":
      return { start: "/*", end: "*/", line: "" };
    default:
      return { line: "//" };
  }
}

function buildStarterContent(task: { title: string; description: string; starterCode?: string; language: string }): string {
  const c = buildCommentPrefix(task.language);
  const lines: string[] = [];

  if (c.start && c.end) {
    lines.push(c.start);
    lines.push(` Task: ${task.title}`);
    task.description.split("\n").forEach((l) => lines.push(` ${l}`));
    lines.push(c.end);
  } else {
    lines.push(`${c.line} =============================================`);
    lines.push(`${c.line} Task: ${task.title}`);
    lines.push(`${c.line} =============================================`);
    task.description.split("\n").forEach((l) => lines.push(`${c.line} ${l}`));
    lines.push(`${c.line} =============================================`);
  }

  lines.push("");
  if (task.starterCode) {
    lines.push(task.starterCode);
  }
  lines.push("");

  return lines.join("\n");
}

export function CollaborativeEditor({
  roomId,
  participantName,
  participantRole,
  language = "javascript",
  taskTitle,
  taskDescription,
  starterCode,
}: CollaborativeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<{ destroy(): void } | null>(null);
  const bindingRef = useRef<{ destroy(): void } | null>(null);
  const [connectedUsers, setConnectedUsers] = useState(0);

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
  }, [roomId]);

  const handleEditorMount = async (editorInstance: editor.IStandaloneCodeEditor, _monaco: Monaco) => {
    editorRef.current = editorInstance;

    // Dynamic imports to avoid SSR "window is not defined" errors
    const [{ MonacoBinding }, YPartyKitProviderModule] = await Promise.all([
      import("y-monaco"),
      import("y-partykit/provider"),
    ]);
    const YPartyKitProvider = YPartyKitProviderModule.default;

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Connect to the named 'yjs' party server for Yjs sync
    const provider = new YPartyKitProvider(PARTYKIT_HOST, `code-${roomId}`, ydoc, {
      connect: true,
      party: "yjs",
    });
    providerRef.current = provider;

    // Set awareness (cursor info)
    const awareness = provider.awareness;
    awareness.setLocalStateField("user", {
      name: participantName,
      color: getColorForRole(participantRole),
      colorLight: getColorLightForRole(participantRole),
    });

    // Track connected users
    awareness.on("change", () => {
      setConnectedUsers(awareness.getStates().size);
    });

    // Get the shared text type
    const ytext = ydoc.getText("monaco");

    // Seed the document with starter code if empty (only first client to connect does this)
    if (ytext.length === 0 && taskTitle && (starterCode || taskDescription)) {
      ytext.insert(0, buildStarterContent({
        title: taskTitle,
        description: taskDescription || "",
        starterCode,
        language,
      }));
    }

    // Create Monaco binding
    const model = editorInstance.getModel();
    if (model) {
      const binding = new MonacoBinding(
        ytext,
        model,
        new Set([editorInstance]),
        awareness
      );
      bindingRef.current = binding;
    }
  };

  const isReadOnly = participantRole === "observer";

  if (!taskTitle) {
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
            <h3 className="font-semibold text-sm">{taskTitle}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{language}</Badge>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Users className="h-3 w-3" />
              <span>{connectedUsers} editing</span>
            </div>
            {isReadOnly && (
              <Badge variant="secondary" className="text-xs">Read-only</Badge>
            )}
          </div>
        </div>
        {taskDescription && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
            {taskDescription}
          </p>
        )}
      </div>

      {/* Collaborative Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          onMount={handleEditorMount}
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
            readOnly: isReadOnly,
            suggestOnTriggerCharacters: !isReadOnly,
            quickSuggestions: !isReadOnly,
          }}
        />
      </div>
    </div>
  );
}

function getColorForRole(role: string): string {
  switch (role) {
    case "interviewer":
      return "#a855f7";
    case "interviewee":
      return "#3b82f6";
    default:
      return "#6b7280";
  }
}

function getColorLightForRole(role: string): string {
  switch (role) {
    case "interviewer":
      return "#f3e8ff";
    case "interviewee":
      return "#dbeafe";
    default:
      return "#f3f4f6";
  }
}
