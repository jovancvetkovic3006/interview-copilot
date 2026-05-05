import { create } from "zustand";
import type {
  InterviewSession,
  InterviewConfig,
  ChatMessage,
  CodingTask,
  InterviewNote,
  InterviewReview,
  InterviewPhase,
} from "@/types/interview";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

interface InterviewStore {
  session: InterviewSession | null;
  isAgentTyping: boolean;
  isGeneratingReview: boolean;

  // Actions
  startSession: (config: InterviewConfig) => void;
  addMessage: (role: ChatMessage["role"], content: string) => void;
  assignCodingTask: (task: Omit<CodingTask, "id" | "assignedAt">) => void;
  submitCode: (code: string) => void;
  addNote: (category: InterviewNote["category"], content: string) => void;
  setPhase: (phase: InterviewPhase) => void;
  setAgentTyping: (typing: boolean) => void;
  setGeneratingReview: (generating: boolean) => void;
  setReview: (review: InterviewReview) => void;
  endSession: () => void;
  resetSession: () => void;
  updateCurrentCode: (code: string) => void;
}

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  session: null,
  isAgentTyping: false,
  isGeneratingReview: false,

  startSession: (config) => {
    const session: InterviewSession = {
      id: generateId(),
      config,
      phase: "in-progress",
      messages: [],
      codingTasks: [],
      currentTaskIndex: -1,
      notes: [],
      startedAt: Date.now(),
    };
    set({ session });
  },

  addMessage: (role, content) => {
    const { session } = get();
    if (!session) return;

    const message: ChatMessage = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    };

    set({
      session: {
        ...session,
        messages: [...session.messages, message],
      },
    });
  },

  assignCodingTask: (taskData) => {
    const { session } = get();
    if (!session) return;

    const task: CodingTask = {
      ...taskData,
      id: generateId(),
      assignedAt: Date.now(),
    };

    set({
      session: {
        ...session,
        codingTasks: [...session.codingTasks, task],
        currentTaskIndex: session.codingTasks.length,
      },
    });
  },

  submitCode: (code) => {
    const { session } = get();
    if (!session || session.currentTaskIndex < 0) return;

    const tasks = [...session.codingTasks];
    tasks[session.currentTaskIndex] = {
      ...tasks[session.currentTaskIndex],
      submittedCode: code,
      submittedAt: Date.now(),
    };

    set({
      session: {
        ...session,
        codingTasks: tasks,
      },
    });
  },

  addNote: (category, content) => {
    const { session } = get();
    if (!session) return;

    const note: InterviewNote = {
      id: generateId(),
      timestamp: Date.now(),
      category,
      content,
    };

    set({
      session: {
        ...session,
        notes: [...session.notes, note],
      },
    });
  },

  setPhase: (phase) => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, phase } });
  },

  setAgentTyping: (typing) => set({ isAgentTyping: typing }),

  setGeneratingReview: (generating) => set({ isGeneratingReview: generating }),

  setReview: (review) => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, review, phase: "review" } });
  },

  endSession: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, endedAt: Date.now() } });
  },

  resetSession: () => set({ session: null, isAgentTyping: false, isGeneratingReview: false }),

  updateCurrentCode: (code) => {
    const { session } = get();
    if (!session || session.currentTaskIndex < 0) return;

    const tasks = [...session.codingTasks];
    tasks[session.currentTaskIndex] = {
      ...tasks[session.currentTaskIndex],
      submittedCode: code,
    };

    set({
      session: {
        ...session,
        codingTasks: tasks,
      },
    });
  },
}));
