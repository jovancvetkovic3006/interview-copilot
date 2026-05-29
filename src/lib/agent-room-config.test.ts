import { describe, expect, it } from "vitest";
import type { QuestionScoreEntry, TranscriptAnalysisEntry } from "@/types/room";
import { formatManualQuestionScoresPromptSection } from "./chat-prompt-sections";
import {
  buildRecentQuestionScoresForAgent,
  buildTranscriptInsightsForAgent,
} from "./agent-room-config";

describe("agent config: transcript insights flow", () => {
  it("includes latest analyses for /api/chat after host STT analysis", () => {
    const analyses: TranscriptAnalysisEntry[] = [
      {
        id: "1",
        timestamp: 1,
        transcriptEndLength: 3,
        summary: "Weak on complexity.",
        score: 4,
        answerQuality: "weak",
        followUpQuestions: ["What is big-O of your approach?"],
      },
    ];

    const payload = buildTranscriptInsightsForAgent(analyses);
    expect(payload.transcriptInsights?.[0].summary).toContain("Weak on complexity");
    expect(payload.transcriptInsights?.[0].followUpQuestions).toHaveLength(1);
  });
});

describe("agent config: manual question scores flow", () => {
  it("feeds re-scored questions into agent without duplicates in payload shape", () => {
    const scores: QuestionScoreEntry[] = [
      {
        id: "qs-1",
        questionId: "q1",
        question: "Explain event loop",
        score: 8,
        scoredAt: 100,
        category: "javascript",
      },
    ];

    const payload = buildRecentQuestionScoresForAgent(scores);
    expect(payload.recentQuestionScores?.[0].scoreLabel).toBe("Strong");
    expect(payload.recentQuestionScores?.[0].category).toBe("javascript");

    const prompt = formatManualQuestionScoresPromptSection(payload.recentQuestionScores!);
    expect(prompt).toContain("MANUAL QUESTION SCORES");
    expect(prompt).toContain("Explain event loop");
    expect(prompt).toContain("probe weak scores");
  });
});
