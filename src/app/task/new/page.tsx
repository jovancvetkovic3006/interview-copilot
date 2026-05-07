"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2, Sparkles } from "lucide-react";
import { createPreTask } from "@/lib/pretask-client";
import { CODING_TASK_PRESETS } from "@/data/presets";
import type { CodingTaskPreset } from "@/types/interview";

const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "kotlin",
  "swift",
  "go",
  "sql",
] as const;

/** Roles available in the preset picker, in display order. "General" lives next to "All". */
const PRESET_ROLES: string[] = ["All", "General", ...Object.keys(CODING_TASK_PRESETS).filter((r) => r !== "General")];

/** Flat list of every preset across roles, with the role attached for the "All" view's badge. */
const ALL_PRESETS: (CodingTaskPreset & { role: string })[] = Object.entries(CODING_TASK_PRESETS).flatMap(
  ([role, tasks]) => tasks.map((t) => ({ ...t, role }))
);

export default function NewPreTaskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<string>("javascript");
  const [starterCode, setStarterCode] = useState("");
  const [candidateLabel, setCandidateLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetRole, setPresetRole] = useState<string>("General");
  // Track which preset's content is currently in the form so we can highlight it.
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  const visiblePresets = useMemo<(CodingTaskPreset & { role: string })[]>(() => {
    if (presetRole === "All") return ALL_PRESETS;
    return (CODING_TASK_PRESETS[presetRole] ?? []).map((t) => ({ ...t, role: presetRole }));
  }, [presetRole]);

  const applyPreset = (preset: CodingTaskPreset) => {
    setTitle(preset.title);
    setDescription(preset.description);
    setLanguage(preset.language);
    setStarterCode(preset.starterCode);
    setAppliedPresetId(preset.id);
  };

  const clearPreset = () => {
    setTitle("");
    setDescription("");
    setStarterCode("");
    setAppliedPresetId(null);
  };

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { code } = await createPreTask({
        title: title.trim(),
        description: description.trim(),
        language,
        starterCode,
        candidateLabel: candidateLabel.trim() || undefined,
      });
      router.push(`/task/${code}/manage?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pre-task");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 p-4 py-10 flex justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <Link
          href="/interview"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to interview lobby
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Create take-home task</CardTitle>
                <CardDescription>
                  Generates a shareable link the candidate opens to solve the task on their own time.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Preset picker — same UX as the interview SetupForm coding-task tab. */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                    <span className="text-xs font-medium">Pick from presets</span>
                  </div>
                  {appliedPresetId && (
                    <button
                      type="button"
                      onClick={clearPreset}
                      className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ROLES.map((role) => (
                    <Badge
                      key={role}
                      variant={presetRole === role ? "default" : "secondary"}
                      className="cursor-pointer text-xs"
                      onClick={() => setPresetRole(role)}
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
                {visiblePresets.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {visiblePresets.map((task) => {
                      const isSelected = appliedPresetId === task.id;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => applyPreset(task)}
                          className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500"
                              : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{task.title}</div>
                              <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{task.description}</div>
                            </div>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="secondary" className="text-xs">{task.language}</Badge>
                            <Badge variant="secondary" className="text-xs capitalize">{task.difficulty}</Badge>
                            {presetRole === "All" && (
                              <Badge variant="secondary" className="text-xs">{task.role}</Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 py-3 text-center">
                    No presets for &quot;{presetRole}&quot;. Pick another role or fill the fields below.
                  </p>
                )}
                <p className="text-[11px] text-zinc-500">
                  Selecting a preset fills the fields below. You can edit anything before creating.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setAppliedPresetId(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Implement a debounce utility"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setAppliedPresetId(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain the requirements, constraints, and any edge cases the candidate should handle."
                  rows={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Language</label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.map((lang) => (
                    <Badge
                      key={lang}
                      variant={language === lang ? "default" : "secondary"}
                      className="cursor-pointer text-xs"
                      onClick={() => setLanguage(lang)}
                    >
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Starter code (optional)</label>
                <textarea
                  value={starterCode}
                  onChange={(e) => {
                    setStarterCode(e.target.value);
                    setAppliedPresetId(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={"function debounce(fn, delay) {\n  // your code here\n}"}
                  rows={8}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Candidate label <span className="text-xs font-normal text-zinc-500">(optional, only you see this)</span>
                </label>
                <input
                  type="text"
                  value={candidateLabel}
                  onChange={(e) => setCandidateLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Jane Doe — frontend role"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create task and get link"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
