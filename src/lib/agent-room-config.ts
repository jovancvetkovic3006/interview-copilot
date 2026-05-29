import { scoreLevelShortLabel } from "@/lib/question-scoring";
import type { QuestionScoreEntry, TranscriptAnalysisEntry } from "@/types/room";

export function buildTranscriptInsightsForAgent(
  analyses: TranscriptAnalysisEntry[]
): {
  transcriptInsights: {
    summary: string;
    answerQuality: string;
    score: number;
    followUpQuestions?: string[];
  }[];
} | Record<string, never> {
  if (analyses.length === 0) return {};
  return {
    transcriptInsights: analyses.slice(-8).map((a) => ({
      summary: a.summary,
      answerQuality: a.answerQuality,
      score: a.score,
      ...(a.followUpQuestions?.length
        ? { followUpQuestions: a.followUpQuestions.slice(0, 3) }
        : {}),
    })),
  };
}

export function buildRecentQuestionScoresForAgent(
  scores: QuestionScoreEntry[]
): {
  recentQuestionScores: {
    question: string;
    score: number;
    scoreLabel: string;
    scoredAt: number;
    category?: string;
  }[];
} | Record<string, never> {
  if (scores.length === 0) return {};
  return {
    recentQuestionScores: scores.map((s) => ({
      question: s.question,
      score: s.score,
      scoreLabel: scoreLevelShortLabel(s.score),
      scoredAt: s.scoredAt,
      ...(s.category ? { category: s.category } : {}),
    })),
  };
}
