export type Difficulty = "junior" | "mid" | "senior" | "lead";

export type InterviewPhase = "setup" | "in-progress" | "review";

export type MessageRole = "agent" | "candidate";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface CodingTask {
  id: string;
  title: string;
  description: string;
  starterCode: string;
  language: string;
  assignedAt: number;
  submittedCode?: string;
  submittedAt?: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: "cv" | "bio" | "other";
  text: string;
}

export interface PreInterviewTask {
  title: string;
  description: string;
  language: string;
  starterCode: string;
  submittedCode?: string;
}

export type PresetStrand = "frontend" | "backend" | "fullstack";

export interface PredefinedQuestion {
  id: string;
  question: string;
  category: string;
  /**
   * When set, this question appears only for those interview difficulty levels.
   * When omitted, the question is shown for every level (legacy / universal).
   */
  levels?: Difficulty[];
  /** For Full Stack presets: groups questions in setup (React vs .NET vs shared). */
  strand?: PresetStrand;
}

export interface CodingTaskPreset {
  id: string;
  title: string;
  description: string;
  starterCode: string;
  language: string;
  difficulty: Difficulty;
  /**
   * When true, the exercise is meant for discussion / static review (types, security, logic)
   * rather than running code in the shared editor.
   */
  staticReview?: boolean;
  /** For Full Stack presets: groups tasks with questions (React vs .NET vs shared). */
  strand?: PresetStrand;
  /**
   * When true, this entry represents a task the candidate already solved on an external provider
   * (HackerRank, CodeSignal, etc.). The interviewer pasted the task description and the candidate's
   * solution at setup time. `starterCode` carries the candidate's solution so opening the task in
   * the shared editor seeds the buffer with their code, ready for live discussion.
   */
  preTask?: boolean;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  categories: string[];
}

export interface InterviewConfig {
  candidateName: string;
  role: string;
  difficulty: Difficulty;
  topics: string[];
  duration: number; // in minutes
  agentInstructions: string;
  uploadedFiles: UploadedFile[];
  notes: string;
  preInterviewTask?: PreInterviewTask;
  selectedQuestions: PredefinedQuestion[];
  selectedCodingTasks: CodingTaskPreset[];
  reviewTemplate?: ReviewTemplate;
}

export interface InterviewNote {
  id: string;
  timestamp: number;
  category: "question" | "coding" | "general" | "strength" | "weakness";
  content: string;
}

export interface InterviewSession {
  id: string;
  config: InterviewConfig;
  phase: InterviewPhase;
  messages: ChatMessage[];
  codingTasks: CodingTask[];
  currentTaskIndex: number;
  notes: InterviewNote[];
  startedAt: number;
  endedAt?: number;
  review?: InterviewReview;
}

export interface ReviewScore {
  category: string;
  score: number; // 1-10
  comment: string;
}

export interface InterviewReview {
  overallScore: number;
  summary: string;
  scores: ReviewScore[];
  strengths: string[];
  weaknesses: string[];
  recommendation: "strong-hire" | "hire" | "maybe" | "no-hire";
  detailedNotes: string;
}
