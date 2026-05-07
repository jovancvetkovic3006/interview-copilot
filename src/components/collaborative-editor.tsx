"use client";

import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import * as Y from "yjs";
// y-monaco and y-partykit/provider are imported dynamically in handleEditorMount
// because they access `window` at module level, which breaks SSR.
import { Badge } from "@/components/ui/badge";
import { Code2, FileCode, Users } from "lucide-react";
import type { editor } from "monaco-editor";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

/** Avoid double `destroy()` on the same Yjs / PartyKit object (logs "[yjs] Tried to remove event handler…"). */
const disposedCollaboration = new WeakSet<object>();

function destroyCollaborationOnce(target: object | null | undefined, destroy: () => void) {
  if (!target || disposedCollaboration.has(target)) return;
  disposedCollaboration.add(target);
  try {
    destroy();
  } catch {
    /* idempotent teardown */
  }
}

export interface CollaborativeEditorHandle {
  /** Full shared document text from Yjs (Monaco buffer), or empty string if not connected yet. */
  getSharedCode: () => string;
}

interface CollaborativeEditorProps {
  roomId: string;
  participantName: string;
  participantRole: "interviewer" | "candidate";
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

/** Single writer for initial task text: smallest awareness client among interviewers, else among editors. */
function pickDesignatedSeederClientId(awareness: {
  getStates: () => Map<number, { user?: { role?: string } }>;
}): number | null {
  const entries = [...awareness.getStates().entries()];
  const interviewerIds = entries
    .filter(([, s]) => s.user?.role === "interviewer")
    .map(([id]) => id)
    .sort((a, b) => a - b);
  if (interviewerIds.length > 0) return interviewerIds[0];
  const editorIds = entries
    .filter(([, s]) => {
      const r = s.user?.role;
      return r === "interviewer" || r === "candidate";
    })
    .map(([id]) => id)
    .sort((a, b) => a - b);
  return editorIds[0] ?? null;
}

/** Stable id so each assigned task gets its own Yjs room (re-assign = fresh doc + one seed). */
function codingTaskRoomSuffix(
  title: string,
  language: string,
  description: string,
  starterCode?: string
): string {
  const s = `${title}\0${language}\0${description}\0${starterCode ?? ""}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const CollaborativeEditorInner = forwardRef<CollaborativeEditorHandle, CollaborativeEditorProps>(
  function CollaborativeEditor(
    {
      roomId,
      participantName,
      participantRole,
      language = "javascript",
      taskTitle,
      taskDescription,
      starterCode,
    },
    ref
  ) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<{ destroy(): void } | null>(null);
  const bindingRef = useRef<{ destroy(): void } | null>(null);
  const seedKickTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const editorMountGenerationRef = useRef(0);
  const awarenessUnsubRef = useRef<(() => void) | null>(null);
  const providerSyncUnsubRef = useRef<(() => void) | null>(null);
  const [connectedUsers, setConnectedUsers] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      getSharedCode: () => {
        const ydoc = ydocRef.current;
        if (!ydoc) return "";
        try {
          return ydoc.getText("monaco").toString();
        } catch {
          return "";
        }
      },
    }),
    []
  );

  const taskRoomSuffix = useMemo(() => {
    if (!taskTitle) return "";
    return codingTaskRoomSuffix(
      taskTitle,
      language,
      taskDescription ?? "",
      starterCode
    );
  }, [taskTitle, language, taskDescription, starterCode]);

  useEffect(() => {
    return () => {
      for (const t of seedKickTimersRef.current) clearTimeout(t);
      seedKickTimersRef.current = [];
      // MonacoBinding is destroyed by y-monaco when the model disposes (Editor unmount).
      bindingRef.current = null;

      const provider = providerRef.current;
      const ydoc = ydocRef.current;
      const unsubAwareness = awarenessUnsubRef.current;
      const unsubSync = providerSyncUnsubRef.current;
      providerRef.current = null;
      ydocRef.current = null;
      awarenessUnsubRef.current = null;
      providerSyncUnsubRef.current = null;

      // Synchronous teardown: deferring with queueMicrotask let the old WebSocket stay open while a new
      // mount connected to the same PartyKit room — two live Y.Docs in one tab corrupted shared state.
      // MonacoBinding is already torn down in commit (model onWillDispose) before this passive cleanup runs.
      unsubAwareness?.();
      unsubSync?.();
      if (provider) destroyCollaborationOnce(provider, () => provider.destroy());
      if (ydoc) destroyCollaborationOnce(ydoc, () => ydoc.destroy());
    };
  }, [roomId, taskRoomSuffix]);

  const handleEditorMount = async (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    void monaco;
    const mountGen = ++editorMountGenerationRef.current;
    editorRef.current = editorInstance;

    // Dynamic imports to avoid SSR "window is not defined" errors
    const [{ MonacoBinding }, YPartyKitProviderModule] = await Promise.all([
      import("y-monaco"),
      import("y-partykit/provider"),
    ]);
    if (mountGen !== editorMountGenerationRef.current) return;

    const YPartyKitProvider = YPartyKitProviderModule.default;

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const yPartyRoomName = `code-${roomId}-${taskRoomSuffix}`;

    // Connect to the named 'yjs' party server for Yjs sync
    const provider = new YPartyKitProvider(PARTYKIT_HOST, yPartyRoomName, ydoc, {
      connect: true,
      party: "yjs",
    });
    providerRef.current = provider;

    // Set awareness (cursor info)
    const awareness = provider.awareness;
    awareness.setLocalStateField("user", {
      name: participantName,
      role: participantRole,
      color: getColorForRole(participantRole),
      colorLight: getColorLightForRole(participantRole),
    });

    // Track connected users (must `off` before provider.destroy — leaks and can interact with teardown).
    const onAwarenessChange = () => {
      setConnectedUsers(awareness.getStates().size);
    };
    awareness.on("change", onAwarenessChange);
    awarenessUnsubRef.current = () => {
      awareness.off("change", onAwarenessChange);
    };

    // Get the shared text type
    const ytext = ydoc.getText("monaco");

    // Seed only after Yjs has synced, and only from one designated client (see pickDesignatedSeederClientId).
    // Before sync, two browsers both see ytext.length === 0 and each inserts → duplicated task in the CRDT.
    const trySeedAfterSync = () => {
      if (!taskTitle || (!starterCode && !taskDescription)) return;
      const designated = pickDesignatedSeederClientId(awareness);
      if (designated === null || ydoc.clientID !== designated) return;
      ydoc.transact(() => {
        if (ytext.length === 0) {
          ytext.insert(
            0,
            buildStarterContent({
              title: taskTitle,
              description: taskDescription || "",
              starterCode,
              language,
            })
          );
        }
      });
    };

    const model = editorInstance.getModel();
    const attachBinding = () => {
      if (!model || bindingRef.current) return;
      bindingRef.current = new MonacoBinding(
        ytext,
        model,
        new Set([editorInstance]),
        awareness
      );
    };

    const scheduleSeedKicks = () => {
      const kick = () => trySeedAfterSync();
      queueMicrotask(kick);
      const t = setTimeout(kick, 150);
      seedKickTimersRef.current.push(t);
    };

    const onSynced = (synced: boolean) => {
      if (!synced) return;
      // Bind only after the doc has merged server state. Binding earlier lets Monaco apply local edits
      // while Y.Text is still empty vs remote, which shows up as text in the wrong offsets for peers.
      attachBinding();
      scheduleSeedKicks();
    };

    provider.on("sync", onSynced);
    providerSyncUnsubRef.current = () => {
      provider.off("sync", onSynced);
    };

    if (provider.synced) {
      onSynced(true);
    }
  };

  // Both interviewer and candidate can edit the shared buffer; no read-only role anymore.
  const isReadOnly = false;

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
          key={`${roomId}-${taskRoomSuffix}`}
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
);

CollaborativeEditorInner.displayName = "CollaborativeEditor";

/** Memoized editor with ref support for reading shared Yjs text (e.g. submit-for-review). */
export const CollaborativeEditor = memo(CollaborativeEditorInner);

function getColorForRole(role: string): string {
  switch (role) {
    case "interviewer":
      return "#a855f7";
    case "candidate":
      return "#3b82f6";
    default:
      return "#6b7280";
  }
}

function getColorLightForRole(role: string): string {
  switch (role) {
    case "interviewer":
      return "#f3e8ff";
    case "candidate":
      return "#dbeafe";
    default:
      return "#f3f4f6";
  }
}
