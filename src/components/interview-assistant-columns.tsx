"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Mic, Sparkles } from "lucide-react";

const COLLAPSED_W = 40;
const MIN_PANEL_W = 200;
const MAX_PANEL_W = 520;
const RESIZER_W = 6;

function clampWidth(w: number): number {
  return Math.min(MAX_PANEL_W, Math.max(MIN_PANEL_W, w));
}

type Props = {
  transcriptBody: ReactNode;
  insightsBody: ReactNode;
  chat: ReactNode;
  speechLanguageLabel: string;
  isRecording: boolean;
  transcriptLineCount: number;
  insightsCount: number;
  analysisBusy: boolean;
};

function VerticalResizer({
  label,
  onMouseDown,
}: {
  label: string;
  onMouseDown: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      className="w-1.5 shrink-0 cursor-col-resize bg-zinc-200 hover:bg-blue-400/70 dark:bg-zinc-800 dark:hover:bg-blue-600/60 transition-colors"
      onMouseDown={onMouseDown}
    />
  );
}

export function InterviewAssistantColumns({
  transcriptBody,
  insightsBody,
  chat,
  speechLanguageLabel,
  isRecording,
  transcriptLineCount,
  insightsCount,
  analysisBusy,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [transcriptW, setTranscriptW] = useState(280);
  const [insightsW, setInsightsW] = useState(280);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const dragRef = useRef<"ti" | "ic" | null>(null);

  const insightsLeftOffset = useCallback(() => {
    let x = transcriptCollapsed ? COLLAPSED_W : transcriptW;
    if (!transcriptCollapsed && !insightsCollapsed) x += RESIZER_W;
    return x;
  }, [transcriptCollapsed, transcriptW, insightsCollapsed]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !rowRef.current) return;
      const left = e.clientX - rowRef.current.getBoundingClientRect().left;
      if (dragRef.current === "ti" && !transcriptCollapsed) {
        setTranscriptW(clampWidth(left));
      } else if (dragRef.current === "ic" && !insightsCollapsed) {
        setInsightsW(clampWidth(left - insightsLeftOffset()));
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [transcriptCollapsed, insightsCollapsed, insightsLeftOffset]);

  return (
    <div
      ref={rowRef}
      className="flex flex-1 min-w-0 min-h-0 border-r border-zinc-200 dark:border-zinc-800"
    >
      {/* Transcript column — STT keeps running when collapsed */}
      <div
        data-testid="transcript-panel"
        className="flex flex-col min-h-0 shrink-0 overflow-hidden bg-zinc-50/80 dark:bg-zinc-900/40 border-r border-zinc-200/80 dark:border-zinc-800"
        style={{ width: transcriptCollapsed ? COLLAPSED_W : transcriptW }}
      >
        {transcriptCollapsed ? (
          <div className="flex flex-col items-center h-full py-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              data-testid="transcript-panel-expand"
              title="Show live transcript"
              onClick={() => setTranscriptCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Mic
              className={`h-4 w-4 ${isRecording ? "text-red-500 animate-pulse" : "text-zinc-400"}`}
              aria-hidden
            />
            {transcriptLineCount > 0 && (
              <span className="text-[9px] font-medium text-zinc-500 tabular-nums">{transcriptLineCount}</span>
            )}
          </div>
        ) : (
          <>
            <div className="px-2 py-2 flex items-center gap-1 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                data-testid="transcript-panel-collapse"
                title="Collapse transcript (recording still works)"
                onClick={() => setTranscriptCollapsed(true)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Mic
                className={`h-3.5 w-3.5 shrink-0 ${isRecording ? "text-red-500 animate-pulse" : "text-zinc-400"}`}
              />
              <span className="text-xs font-medium truncate">Live transcript</span>
              {isRecording && <span className="text-[10px] text-red-500 shrink-0">● REC</span>}
              <span
                className="text-[10px] text-zinc-500 ml-auto truncate max-w-[5rem]"
                title="Web Speech API language"
              >
                {speechLanguageLabel}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{transcriptBody}</div>
          </>
        )}
      </div>

      {!transcriptCollapsed && !insightsCollapsed && (
        <VerticalResizer
          label="Resize transcript and insights panels"
          onMouseDown={() => {
            dragRef.current = "ti";
          }}
        />
      )}

      {/* Insights column — analysis continues when collapsed */}
      <div
        data-testid="insights-panel"
        className="flex flex-col min-h-0 shrink-0 overflow-hidden bg-violet-50/80 dark:bg-violet-950/30 border-r border-violet-200/60 dark:border-violet-900/50"
        style={{ width: insightsCollapsed ? COLLAPSED_W : insightsW }}
      >
        {insightsCollapsed ? (
          <div className="flex flex-col items-center h-full py-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              data-testid="insights-panel-expand"
              title="Show answer insights"
              onClick={() => setInsightsCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Sparkles
              className={`h-4 w-4 ${analysisBusy ? "text-violet-500 animate-pulse" : "text-violet-400"}`}
              aria-hidden
            />
            {insightsCount > 0 && (
              <span className="text-[9px] font-medium text-violet-600 tabular-nums">{insightsCount}</span>
            )}
          </div>
        ) : (
          <>
            <div className="px-2 py-2 flex items-center gap-1 shrink-0 border-b border-violet-200/80 dark:border-violet-900/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                data-testid="insights-panel-collapse"
                title="Collapse insights (analysis still runs)"
                onClick={() => setInsightsCollapsed(true)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
              <span className="text-xs font-medium text-violet-900 dark:text-violet-100 truncate">
                Answer insights
              </span>
              {analysisBusy && (
                <span className="text-[10px] text-violet-600 dark:text-violet-400 ml-auto animate-pulse shrink-0">
                  …
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{insightsBody}</div>
          </>
        )}
      </div>

      {!insightsCollapsed && (
        <VerticalResizer
          label="Resize insights and chat panels"
          onMouseDown={() => {
            dragRef.current = "ic";
          }}
        />
      )}

      {/* Chat column */}
      <div
        data-testid="chat-panel"
        className="flex flex-col flex-1 min-w-[220px] min-h-0 overflow-hidden"
      >
        {chat}
      </div>
    </div>
  );
}
