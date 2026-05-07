"use client";

import React, { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Strips the agent-protocol markers that should never be visible to users:
 *   - `[CODING_TASK]{...}[/CODING_TASK]` → coding task assignment payload (parsed elsewhere)
 *   - `[INTERVIEW_COMPLETE]`             → interview-end signal
 * Without this, raw markers leak into the chat bubble.
 */
const PROTOCOL_PATTERNS: RegExp[] = [
  /\[CODING_TASK\][\s\S]*?\[\/CODING_TASK\]/g,
  /\[INTERVIEW_COMPLETE\]/g,
];

function sanitizeAgentContent(raw: string): string {
  let out = raw;
  for (const re of PROTOCOL_PATTERNS) out = out.replace(re, "");
  // Collapse any blank-line streaks the markers left behind so the markdown renderer
  // doesn't leave an awkward gap where a tag used to sit.
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Markdown component overrides that pin every block element to our chat-bubble typography. */
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="text-sm leading-relaxed [&:not(:last-child)]:mb-2">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>
  ),
  h4: ({ children }) => (
    <h6 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mt-2 mb-1 first:mt-0">
      {children}
    </h6>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 [&:not(:last-child)]:mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 [&:not(:last-child)]:mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-600 pl-3 italic text-zinc-700 dark:text-zinc-300 [&:not(:last-child)]:mb-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-700" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  // ReactMarkdown distinguishes inline vs block code via `node.tagName`; the renderer wraps
  // block <code> in <pre>, so we just style each separately.
  code: ({ children, className }) => {
    const isBlock = typeof className === "string" && className.startsWith("language-");
    if (isBlock) {
      return (
        <code className={cn("text-[12px] font-mono leading-snug", className)}>
          {children}
        </code>
      );
    }
    return (
      <code className="px-1 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-700/70 font-mono text-[12px]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="rounded-md bg-zinc-950 text-zinc-100 dark:bg-black p-3 overflow-x-auto [&:not(:last-child)]:mb-2 text-[12px] leading-snug">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto [&:not(:last-child)]:mb-2">
      <table className="text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-zinc-300 dark:border-zinc-600">{children}</thead>
  ),
  th: ({ children }) => <th className="px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => (
    <td className="px-2 py-1 border-t border-zinc-200 dark:border-zinc-700">{children}</td>
  ),
};

interface AgentMessageProps {
  content: string;
  /** Optional extra classes for the wrapper. */
  className?: string;
}

/**
 * Renders an AI-agent chat bubble's contents as formatted markdown so multi-section
 * replies (intro + question, headings, bullet lists, code blocks, etc.) read clearly
 * instead of as one undifferentiated wall of text.
 */
export const AgentMessage = memo(function AgentMessage({ content, className }: AgentMessageProps) {
  const cleaned = useMemo(() => sanitizeAgentContent(content), [content]);
  if (!cleaned) {
    // Sanitizer dropped everything (e.g. message was a bare protocol marker) — render nothing
    // so the chat doesn't show an empty bubble.
    return null;
  }
  return (
    <div className={cn("text-sm space-y-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
});
