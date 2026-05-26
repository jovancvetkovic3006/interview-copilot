export interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export interface QuizTemplate {
  id: string;
  title: string;
  description: string;
  /** Role/track label, e.g. "Backend Senior" */
  track: string;
  questions: QuizQuestion[];
}

/** Live quiz assigned during an interview room session. */
export interface ActiveQuiz {
  quizId: string;
  templateId: string;
  title: string;
  questions: QuizQuestion[];
  /** Seconds allowed per question (default 180 = 3 min). */
  secondsPerQuestion: number;
  assignedAt: number;
}

export interface QuizAnswerEntry {
  questionId: string;
  selectedIndex: number;
  answeredAt: number;
  /** Milliseconds spent on this question before answering. */
  timeSpentMs: number;
}

export interface QuizSubmission {
  answers: QuizAnswerEntry[];
  submittedAt: number;
  candidateName?: string;
}

/** Async standalone quiz (PartyKit durable storage). */
export interface AsyncQuizDef {
  code: string;
  templateId: string;
  title: string;
  description: string;
  track: string;
  questions: QuizQuestion[];
  secondsPerQuestion: number;
  createdAt: number;
  candidateLabel?: string;
}

export interface AsyncQuizState {
  def: AsyncQuizDef;
  submission: QuizSubmission | null;
}
