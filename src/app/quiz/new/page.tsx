"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { createAsyncQuiz } from "@/lib/quiz-client";
import { QUIZ_TEMPLATES, DEFAULT_SECONDS_PER_QUESTION } from "@/data/quiz-templates";

export default function NewQuizPage() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(QUIZ_TEMPLATES[0]?.id ?? "");
  const [candidateLabel, setCandidateLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = QUIZ_TEMPLATES.find((t) => t.id === selectedId);

  const handleCreate = async () => {
    if (!template) return;
    setSubmitting(true);
    setError(null);
    try {
      const { code } = await createAsyncQuiz({
        templateId: template.id,
        title: template.title,
        description: template.description,
        track: template.track,
        questions: template.questions,
        secondsPerQuestion: DEFAULT_SECONDS_PER_QUESTION,
        ...(candidateLabel.trim() ? { candidateLabel: candidateLabel.trim() } : {}),
      });
      router.push(`/quiz/${code}/manage`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create quiz");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/interview" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              Create a quiz
            </CardTitle>
            <CardDescription>
              Send a multiple-choice quiz to a candidate. Up to 20 questions, 3 minutes per question, 4 options each.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Quiz template</label>
              <div className="space-y-2">
                {QUIZ_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`quiz-template-${t.id}`}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selectedId === t.id
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{t.title}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {t.questions.length} questions
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Candidate label (optional)</label>
              <input
                type="text"
                value={candidateLabel}
                onChange={(e) => setCandidateLabel(e.target.value)}
                placeholder="e.g. Jane Doe — BE round"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="button" className="w-full" data-testid="create-quiz-btn" onClick={handleCreate} disabled={submitting || !template}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create quiz & get share link"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
