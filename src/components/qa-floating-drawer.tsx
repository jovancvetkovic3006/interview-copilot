"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ListChecks, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function QaFloatingDrawer({ open, onOpenChange, panelRef, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="absolute inset-0 z-30 pointer-events-none">
      {!open && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="qa-drawer-toggle"
          title="Open Q&A panel (questions, tasks, quizzes, CV)"
          onClick={() => onOpenChange(true)}
          className="absolute top-2 right-2 z-40 pointer-events-auto shadow-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm"
        >
          <ListChecks className="h-3.5 w-3.5" />
          Q&amp;A
        </Button>
      )}

      <div
        data-testid="qa-drawer"
        aria-hidden={!open}
        className={`absolute inset-y-0 right-0 z-40 flex w-[min(100vw-2rem,320px)] min-w-[260px] flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl transition-transform duration-300 ease-out pointer-events-auto ${
          open ? "translate-x-0" : "translate-x-full"
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
    </div>
  );
}
