"use client";

import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ListChecks, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function QaFloatingDrawer({ open, onOpenChange, panelRef, children }: Props) {
  return (
    <>
      {!open && (
        <button
          type="button"
          data-testid="qa-drawer-tab"
          onClick={() => onOpenChange(true)}
          title="Open Q&A panel (questions, tasks, quizzes, CV)"
          className="absolute right-0 top-1/2 z-30 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-lg border border-r-0 border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm px-2 py-3 shadow-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span
            className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-200 tracking-wide"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Q&amp;A
          </span>
        </button>
      )}

      <div
        data-testid="qa-drawer"
        aria-hidden={!open}
        className={`absolute inset-y-0 right-0 z-40 flex w-[min(100vw-2rem,320px)] min-w-[260px] flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50/80 dark:bg-zinc-900/80">
          <span className="text-sm font-medium flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Q&amp;A
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            data-testid="qa-drawer-close"
            title="Close Q&A panel"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          ref={panelRef}
          data-testid="qa-sidebar-panel"
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        >
          {children}
        </div>
      </div>
    </>
  );
}
