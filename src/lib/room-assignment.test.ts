import { describe, expect, it } from "vitest";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";
import { formatLiveQuizForPrompt } from "./quiz-summary";
import { appendLiveQuizToSystemPrompt } from "./chat-quiz-prompt";
import { deriveQuizResultsView } from "./quiz-results-view";
import {
  applyActivateQuiz,
  applyActivateCodingTask,
  applyCodingTaskAssign,
  applyQuizAnswer,
  applyQuizCandidateStarted,
  applyQuizComplete,
  applyQuizStart,
  buildLiveQuizAgentPayload,
  emptyRoomAssignmentState,
  quizHistoryProgressLabel,
  resolveQuizAgentContextForId,
} from "./room-assignment";

const sampleQuiz: ActiveQuiz = {
  quizId: "live-js",
  templateId: "tpl",
  title: "JS basics",
  secondsPerQuestion: 180,
  assignedAt: 1,
  questions: [
    {
      id: "q1",
      question: "typeof null?",
      options: ["object", "null", "undefined", "number"],
      correctIndex: 0,
    },
    {
      id: "q2",
      question: "Array.isArray([])?",
      options: ["true", "false", "maybe", "error"],
      correctIndex: 0,
    },
  ],
};

const answerQ1Correct: QuizAnswerEntry = {
  questionId: "q1",
  selectedIndex: 0,
  answeredAt: 100,
  timeSpentMs: 3000,
};

const submissionPartial: QuizSubmission = {
  submittedAt: 200,
  candidateName: "Alex",
  answers: [answerQ1Correct],
};

const submissionComplete: QuizSubmission = {
  submittedAt: 300,
  candidateName: "Alex",
  answers: [
    answerQ1Correct,
    { questionId: "q2", selectedIndex: 1, answeredAt: 250, timeSpentMs: 5000 },
  ],
};

/**
 * Product flows covered by pure-logic tests in this repo:
 *
 * 1. Live quiz: host assigns → candidate starts → answers → completes → history preserved
 * 2. Interviewer results: waiting / in-progress / complete views (deriveQuizResultsView)
 * 3. Agent: liveQuizContext + history in chat prompt after completion
 * 4. Assignment switch: new coding task freezes quiz in history; re-activate quiz restores state
 * 5. Interview timer: interview-timer.test.ts (host extend → candidate countdown)
 * 6. Phase / waiting room: room-step.test.ts, room-sync.test.ts
 * 7. Manual question scores: question-scoring.test.ts, chat-prompt-sections.test.ts
 * 8. Report gate: interview-report-gate.test.ts
 * 9. Party phase + time extension: party-room-logic.test.ts
 * 10. Coding assign + history switch: room-assignment.test.ts (coding flow)
 * 11. Coding agent review: chat-coding-prompt.test.ts
 * 12. Transcript analysis → agent: transcript-analysis.test.ts, agent-room-config.test.ts
 * 13. End interview report: interview-report-context.test.ts, interview-report-spoken.test.ts
 */

describe("live quiz flow (assign → finish → interviewer + agent)", () => {
  it("host assign: active quiz, waiting for candidate, history shows not started", () => {
    const room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz, 1000);

    expect(room.activeAssignment).toBe("quiz");
    expect(room.quizAnswers).toEqual([]);
    expect(room.quizCandidateStarted).toBe(false);
    expect(room.quizHistory).toHaveLength(1);
    expect(quizHistoryProgressLabel(room.quizHistory[0])).toBe("not started");

    const interviewer = deriveQuizResultsView(sampleQuiz, room.quizAnswers, {
      candidateStarted: room.quizCandidateStarted,
    });
    expect(interviewer.showWaiting).toBe(true);
    expect(interviewer.showComplete).toBe(false);

    const agent = buildLiveQuizAgentPayload(room);
    expect(agent.liveQuizContext?.status).toBe("waiting");
    expect(agent.liveQuizHistory?.[0].status).toBe("waiting");
  });

  it("candidate in progress: interviewer sees partial score; agent prompt is provisional", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizCandidateStarted(room);
    room = applyQuizAnswer(room, answerQ1Correct);

    expect(quizHistoryProgressLabel(room.quizHistory[0])).toBe("1/2");

    const interviewer = deriveQuizResultsView(sampleQuiz, room.quizAnswers, {
      candidateStarted: true,
    });
    expect(interviewer.showInProgress).toBe(true);
    expect(interviewer.correct).toBe(1);
    expect(interviewer.total).toBe(2);

    const agent = buildLiveQuizAgentPayload(room);
    expect(agent.liveQuizContext?.status).toBe("in-progress");
    const { prompt, includesReviewHints } = appendLiveQuizToSystemPrompt("BASE", agent);
    expect(prompt).toContain("CURRENTLY SELECTED LIVE QUIZ");
    expect(prompt).toContain("Score: 1/2 (50%)");
    expect(prompt).toContain("in-progress");
    expect(includesReviewHints).toBe(true);
  });

  it("candidate completes: interviewer sees final score; agent gets wrong-answer detail for follow-ups", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizAnswer(room, answerQ1Correct);
    room = applyQuizComplete(room, submissionComplete);

    expect(quizHistoryProgressLabel(room.quizHistory[0])).toBe("done");

    const interviewer = deriveQuizResultsView(sampleQuiz, room.quizAnswers, {
      submission: room.quizSubmission,
    });
    expect(interviewer.showComplete).toBe(true);
    expect(interviewer.correct).toBe(1);
    expect(interviewer.percentCorrect).toBe(50);
    expect(interviewer.badgeVariant).toBe("secondary");

    const agent = buildLiveQuizAgentPayload(room);
    expect(agent.liveQuizContext?.status).toBe("complete");
    expect(agent.liveQuizContext?.candidateName).toBe("Alex");

    const formatted = formatLiveQuizForPrompt(agent.liveQuizContext!);
    expect(formatted).toContain("[wrong]");
    expect(formatted).toContain("Correct: true");

    const { prompt, includesReviewHints } = appendLiveQuizToSystemPrompt("BASE", agent);
    expect(prompt).toContain("Q2.");
    expect(includesReviewHints).toBe(true);
  });

  it("host assigns coding task after quiz: quiz frozen in history with done label", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizComplete(room, submissionComplete);
    room = applyCodingTaskAssign(room, {
      collaborationTaskId: "task-1",
      title: "Two sum",
    });

    expect(room.activeAssignment).toBe("coding");
    expect(room.quizHistory[0].quizSubmission).toEqual(submissionComplete);
    expect(quizHistoryProgressLabel(room.quizHistory[0])).toBe("done");

    const frozen = resolveQuizAgentContextForId(room, "live-js");
    expect(frozen?.status).toBe("complete");
    expect(frozen?.correctCount).toBe(1);
  });

  it("host re-activates quiz from history: active state and agent context restored", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizComplete(room, submissionComplete);
    room = applyCodingTaskAssign(room, { collaborationTaskId: "t1", title: "Task" });

    const restored = applyActivateQuiz(room, "live-js");
    expect(restored?.activeAssignment).toBe("quiz");
    expect(restored?.quizSubmission).toEqual(submissionComplete);
    expect(restored?.quizAnswers).toHaveLength(2);

    const agent = buildLiveQuizAgentPayload(restored!);
    expect(agent.liveQuizContext?.status).toBe("complete");
  });

  it("re-assigning same quiz id resets in-progress state (host re-run)", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizComplete(room, submissionComplete);
    room = applyQuizStart(room, { ...sampleQuiz, assignedAt: 2 }, 2000);

    expect(room.quizAnswers).toEqual([]);
    expect(room.quizSubmission).toBeNull();
    expect(quizHistoryProgressLabel(room.quizHistory[0])).toBe("not started");
  });
});

describe("live coding task flow (assign → switch history)", () => {
  it("host assigns coding task and can re-open it from history after another task", () => {
    let room = applyCodingTaskAssign(emptyRoomAssignmentState(), {
      collaborationTaskId: "task-a",
      title: "Two Sum",
      description: "Find pair",
      language: "typescript",
    });
    expect(room.activeAssignment).toBe("coding");
    expect(room.codingTaskHistory).toHaveLength(1);

    room = applyCodingTaskAssign(room, {
      collaborationTaskId: "task-b",
      title: "LRU Cache",
      description: "Design cache",
      language: "typescript",
    });
    expect(room.codingTaskHistory).toHaveLength(2);
    expect((room.codingTask as { title?: string }).title).toBe("LRU Cache");

    const restored = applyActivateCodingTask(room, "task-a");
    expect(restored?.activeAssignment).toBe("coding");
    expect((restored?.codingTask as { title?: string }).title).toBe("Two Sum");
  });

  it("assigning coding persists in-progress quiz to history before switch", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizAnswer(room, answerQ1Correct);
    room = applyCodingTaskAssign(room, { collaborationTaskId: "c1", title: "Task" });

    expect(room.quizHistory[0].answers).toHaveLength(1);
    expect(quizHistoryProgressLabel(room.quizHistory[0])).toBe("1/2");
  });
});

describe("buildLiveQuizAgentPayload", () => {
  it("keeps completed quiz in history when host switches to coding (active quiz may still be in room state)", () => {
    let room = applyQuizStart(emptyRoomAssignmentState(), sampleQuiz);
    room = applyQuizComplete(room, submissionComplete);
    room = applyCodingTaskAssign(room, { collaborationTaskId: "c1", title: "X" });

    const payload = buildLiveQuizAgentPayload(room);
    expect(room.activeAssignment).toBe("coding");
    expect(payload.liveQuizHistory?.length).toBe(1);
    expect(payload.liveQuizHistory?.[0].status).toBe("complete");
    expect(payload.liveQuizContext?.status).toBe("complete");
  });
});
