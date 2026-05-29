import {
  buildLiveQuizAgentContext,
  type LiveQuizAgentContext,
} from "@/lib/quiz-summary";
import type { ActiveAssignment, CodingTaskHistoryEntry, QuizHistoryEntry } from "@/types/room";
import type { ActiveQuiz, QuizAnswerEntry, QuizSubmission } from "@/types/quiz";

/** Assignment slice of Party room state (quiz + coding history). */
export interface RoomAssignmentState {
  activeAssignment: ActiveAssignment;
  codingTask: unknown | null;
  activeQuiz: ActiveQuiz | null;
  quizAnswers: QuizAnswerEntry[];
  quizCandidateStarted: boolean;
  quizSubmission: QuizSubmission | null;
  codingTaskHistory: CodingTaskHistoryEntry[];
  quizHistory: QuizHistoryEntry[];
}

export function emptyRoomAssignmentState(): RoomAssignmentState {
  return {
    activeAssignment: "none",
    codingTask: null,
    activeQuiz: null,
    quizAnswers: [],
    quizCandidateStarted: false,
    quizSubmission: null,
    codingTaskHistory: [],
    quizHistory: [],
  };
}

export function quizIdOf(quiz: unknown): string | null {
  if (!quiz || typeof quiz !== "object") return null;
  const id = (quiz as { quizId?: string }).quizId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function taskCollaborationId(task: unknown): string | null {
  if (!task || typeof task !== "object") return null;
  const id = (task as { collaborationTaskId?: string }).collaborationTaskId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function taskTitle(task: unknown): string {
  if (!task || typeof task !== "object") return "Coding task";
  const t = (task as { title?: string }).title;
  return typeof t === "string" && t.trim() ? t.trim() : "Coding task";
}

function persistActiveQuizToHistory(state: RoomAssignmentState): RoomAssignmentState {
  const qid = quizIdOf(state.activeQuiz);
  if (!qid || !state.activeQuiz) return state;

  const entry: QuizHistoryEntry = {
    quizId: qid,
    quiz: state.activeQuiz,
    assignedAt:
      state.quizHistory.find((h) => h.quizId === qid)?.assignedAt ?? Date.now(),
    answers: [...state.quizAnswers],
    quizCandidateStarted: state.quizCandidateStarted,
    quizSubmission: state.quizSubmission,
  };
  const idx = state.quizHistory.findIndex((h) => h.quizId === qid);
  const quizHistory =
    idx >= 0
      ? state.quizHistory.map((h, i) => (i === idx ? entry : h))
      : [...state.quizHistory, entry];

  return { ...state, quizHistory };
}

function syncActiveQuizHistoryFields(state: RoomAssignmentState): RoomAssignmentState {
  const qid = quizIdOf(state.activeQuiz);
  if (!qid) return state;
  const idx = state.quizHistory.findIndex((h) => h.quizId === qid);
  if (idx < 0) return state;
  const quizHistory = state.quizHistory.map((h, i) =>
    i === idx
      ? {
          ...h,
          answers: [...state.quizAnswers],
          quizCandidateStarted: state.quizCandidateStarted,
          quizSubmission: state.quizSubmission,
        }
      : h
  );
  return { ...state, quizHistory };
}

/** Mirrors party/index.ts `quiz-start`. */
export function applyQuizStart(
  state: RoomAssignmentState,
  quiz: ActiveQuiz,
  now = Date.now()
): RoomAssignmentState {
  let next = persistActiveQuizToHistory(state);
  const qid = quizIdOf(quiz);
  next = {
    ...next,
    activeQuiz: quiz,
    quizAnswers: [],
    quizCandidateStarted: false,
    quizSubmission: null,
    activeAssignment: "quiz",
  };
  if (qid) {
    const entry: QuizHistoryEntry = {
      quizId: qid,
      quiz,
      assignedAt: now,
      answers: [],
      quizCandidateStarted: false,
      quizSubmission: null,
    };
    const idx = next.quizHistory.findIndex((h) => h.quizId === qid);
    const quizHistory =
      idx >= 0
        ? next.quizHistory.map((h, i) => (i === idx ? entry : h))
        : [...next.quizHistory, entry];
    next = { ...next, quizHistory };
  }
  return next;
}

/** Mirrors party/index.ts `quiz-candidate-started`. */
export function applyQuizCandidateStarted(state: RoomAssignmentState): RoomAssignmentState {
  return syncActiveQuizHistoryFields({
    ...state,
    quizCandidateStarted: true,
  });
}

/** Mirrors party/index.ts `quiz-answer`. */
export function applyQuizAnswer(
  state: RoomAssignmentState,
  answer: QuizAnswerEntry
): RoomAssignmentState {
  const quizAnswers = [
    ...state.quizAnswers.filter((a) => a.questionId !== answer.questionId),
    answer,
  ];
  return syncActiveQuizHistoryFields({
    ...state,
    quizAnswers,
    quizCandidateStarted: true,
  });
}

/** Mirrors party/index.ts `quiz-complete`. */
export function applyQuizComplete(
  state: RoomAssignmentState,
  submission: QuizSubmission
): RoomAssignmentState {
  const quizAnswers =
    submission.answers?.length > 0 ? submission.answers : state.quizAnswers;
  return syncActiveQuizHistoryFields({
    ...state,
    quizSubmission: submission,
    quizCandidateStarted: true,
    quizAnswers,
  });
}

/** Mirrors party/index.ts `activate-quiz`. */
export function applyActivateQuiz(
  state: RoomAssignmentState,
  quizId: string
): RoomAssignmentState | null {
  let next = persistActiveQuizToHistory(state);
  const entry = next.quizHistory.find((h) => h.quizId === quizId);
  if (!entry) return null;
  const quiz = entry.quiz as ActiveQuiz;
  return {
    ...next,
    activeQuiz: quiz,
    quizAnswers: [...(entry.answers as QuizAnswerEntry[])],
    quizCandidateStarted: entry.quizCandidateStarted,
    quizSubmission: (entry.quizSubmission as QuizSubmission | null) ?? null,
    activeAssignment: "quiz",
  };
}

/** Mirrors party/index.ts `activate-coding-task`. */
export function applyActivateCodingTask(
  state: RoomAssignmentState,
  collaborationTaskId: string
): RoomAssignmentState | null {
  let next = persistActiveQuizToHistory(state);
  const entry = next.codingTaskHistory.find((h) => h.collaborationTaskId === collaborationTaskId);
  if (!entry) return null;
  return {
    ...next,
    codingTask: entry.task,
    activeAssignment: "coding",
  };
}

/** Mirrors party/index.ts `coding-task` (assign new task). */
export function applyCodingTaskAssign(
  state: RoomAssignmentState,
  task: unknown,
  now = Date.now()
): RoomAssignmentState {
  let next = persistActiveQuizToHistory(state);
  const cid = taskCollaborationId(task);
  if (cid) {
    const entry: CodingTaskHistoryEntry = {
      collaborationTaskId: cid,
      task,
      assignedAt: now,
      title: taskTitle(task),
    };
    const idx = next.codingTaskHistory.findIndex((h) => h.collaborationTaskId === cid);
    const codingTaskHistory =
      idx >= 0
        ? next.codingTaskHistory.map((h, i) =>
            i === idx ? { ...entry, assignedAt: h.assignedAt } : h
          )
        : [...next.codingTaskHistory, entry];
    next = { ...next, codingTaskHistory };
  }
  return {
    ...next,
    codingTask: task,
    activeAssignment: "coding",
  };
}

/** Label for assignment history strip (mirrors assignment-history-strip). */
export function quizHistoryProgressLabel(entry: QuizHistoryEntry): string {
  const q = entry.quiz as ActiveQuiz | null;
  const total = q?.questions?.length ?? 0;
  const sub = entry.quizSubmission as QuizSubmission | null;
  const answers = sub?.answers?.length ? sub.answers.length : entry.answers.length;
  if (entry.quizSubmission) return "done";
  if (entry.quizCandidateStarted || answers > 0) return `${answers}/${total}`;
  return "not started";
}

/** Payload for /api/chat live quiz sections (mirrors room-page-client resolveAgentApiConfig). */
export function buildLiveQuizAgentPayload(state: RoomAssignmentState): {
  liveQuizContext?: LiveQuizAgentContext;
  liveQuizHistory?: LiveQuizAgentContext[];
} {
  const contexts = state.quizHistory
    .map((entry) => {
      const q = entry.quiz as ActiveQuiz;
      if (!q?.questions?.length) return null;
      return buildLiveQuizAgentContext(q, entry.answers as QuizAnswerEntry[], {
        submission: (entry.quizSubmission as QuizSubmission | null) ?? null,
        candidateStarted: entry.quizCandidateStarted,
      });
    })
    .filter((c): c is LiveQuizAgentContext => c != null);

  const aq = state.activeQuiz;
  const activeCtx =
    aq?.questions?.length
      ? buildLiveQuizAgentContext(aq, state.quizAnswers, {
          submission: state.quizSubmission,
          candidateStarted: state.quizCandidateStarted,
        })
      : null;

  if (!activeCtx && contexts.length === 0) return {};
  return {
    ...(activeCtx ? { liveQuizContext: activeCtx } : {}),
    ...(contexts.length ? { liveQuizHistory: contexts } : {}),
  };
}

/** Resolve quiz context for a specific history entry or the active quiz. */
export function resolveQuizAgentContextForId(
  state: RoomAssignmentState,
  quizId: string
): LiveQuizAgentContext | null {
  if (quizIdOf(state.activeQuiz) === quizId && state.activeQuiz) {
    return buildLiveQuizAgentContext(state.activeQuiz, state.quizAnswers, {
      submission: state.quizSubmission,
      candidateStarted: state.quizCandidateStarted,
    });
  }
  const entry = state.quizHistory.find((h) => h.quizId === quizId);
  if (!entry) return null;
  const q = entry.quiz as ActiveQuiz;
  if (!q?.questions?.length) return null;
  return buildLiveQuizAgentContext(q, entry.answers as QuizAnswerEntry[], {
    submission: (entry.quizSubmission as QuizSubmission | null) ?? null,
    candidateStarted: entry.quizCandidateStarted,
  });
}
