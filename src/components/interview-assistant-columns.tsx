"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Mic, Sparkles } from "lucide-react";

const COLLAPSED_W = 40;
const MIN_COMBINED_W = 240;
const MAX_COMBINED_W = 520;
const RESIZER_W = 6;
const DEFAULT_TRANSCRIPT_SHARE = 0.2;
const MIN_TRANSCRIPT_SHARE = 0.1;
const MAX_TRANSCRIPT_SHARE = 0.5;

function clampCombinedWidth(w: number): number {
  return Math.min(MAX_COMBINED_W, Math.max(MIN_COMBINED_W, w));
}

function clampTranscriptShare(s: number): number {
  return Math.min(MAX_TRANSCRIPT_SHARE, Math.max(MIN_TRANSCRIPT_SHARE, s));
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

function HorizontalResizer({
  label,
  onMouseDown,
}: {
  label: string;
  onMouseDown: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      className="h-1.5 shrink-0 cursor-row-resize bg-zinc-200 hover:bg-violet-400/70 dark:bg-zinc-800 dark:hover:bg-violet-600/60 transition-colors"
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
  const combinedColRef = useRef<HTMLDivElement>(null);
  const [combinedW, setCombinedW] = useState(360);
  const [transcriptShare, setTranscriptShare] = useState(DEFAULT_TRANSCRIPT_SHARE);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const dragRef = useRef<"ts" | "cc" | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      if (dragRef.current === "cc" && rowRef.current) {
        const left = e.clientX - rowRef.current.getBoundingClientRect().left;
        setCombinedW(clampCombinedWidth(left));
      } else if (dragRef.current === "ts" && combinedColRef.current) {
        const rect = combinedColRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        setTranscriptShare(clampTranscriptShare(y / rect.height));
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
  }, []);

  const showTranscriptInsightsResizer = !transcriptCollapsed && !insightsCollapsed;

  return (
    <div
      ref={rowRef}
      className="flex flex-1 min-w-0 min-h-0 border-r border-zinc-200 dark:border-zinc-800"
    >
      {/* Transcript + insights in one column (default 20% / 80% height split) */}
      <div
        ref={combinedColRef}
        data-testid="transcript-insights-column"
        className="flex flex-col min-h-0 shrink-0 overflow-hidden border-r border-zinc-200/80 dark:border-zinc-800"
        style={{ width: combinedW }}
      >
        {transcriptCollapsed ? (
          <div className="flex items-center gap-2 px-2 py-2 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              data-testid="transcript-panel-expand"
              title="Show live transcript"
              onClick={() => setTranscriptCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Mic
              className={`h-3.5 w-3.5 shrink-0 ${isRecording ? "text-red-500 animate-pulse" : "text-zinc-400"}`}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Transcript</span>
            {transcriptLineCount > 0 && (
              <span className="text-[10px] text-zinc-500 tabular-nums ml-auto">{transcriptLineCount}</span>
            )}
          </div>
        ) : (
          <div
            data-testid="transcript-panel"
            className="flex flex-col min-h-0 shrink-0 overflow-hidden bg-zinc-50/80 dark:bg-zinc-900/40"
            style={
              insightsCollapsed
                ? { flex: "1 1 0" }
                : { flex: `0 0 ${transcriptShare * 100}%` }
            }
          >
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
          </div>
        )}

        {showTranscriptInsightsResizer && (
          <HorizontalResizer
            label="Resize transcript and answer insights"
            onMouseDown={() => {
              dragRef.current = "ts";
            }}
          />
        )}

        {insightsCollapsed ? (
          <div className="flex items-center gap-2 px-2 py-2 border-t border-violet-200/60 dark:border-violet-900/50 bg-violet-50/80 dark:bg-violet-950/30 shrink-0 mt-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              data-testid="insights-panel-expand"
              title="Show answer insights"
              onClick={() => setInsightsCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Sparkles
              className={`h-3.5 w-3.5 shrink-0 ${analysisBusy ? "text-violet-500 animate-pulse" : "text-violet-400"}`}
            />
            <span className="text-xs font-medium text-violet-800 dark:text-violet-200">Insights</span>
            {insightsCount > 0 && (
              <span className="text-[10px] text-violet-600 tabular-nums ml-auto">{insightsCount}</span>
            )}
          </div>
        ) : (
          <div
            data-testid="insights-panel"
            className="flex flex-col flex-1 min-h-0 overflow-hidden bg-violet-50/80 dark:bg-violet-950/30"
          >
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
          </div>
        )}
      </div>

      <VerticalResizer
        label="Resize transcript/insights and chat panels"
        onMouseDown={() => {
          dragRef.current = "cc";
        }}
      />

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
