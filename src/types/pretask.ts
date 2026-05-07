/**
 * Async / take-home coding task that the candidate solves on their own time.
 * Lives in its own PartyKit room (party=pretask) keyed by `code`, independent
 * from any live interview room. The interviewer can later import this task
 * (and its submission) into a live interview via the SetupForm.
 */

export interface PreTaskDef {
  /** Short, URL-safe code (e.g. ABC123) used in `/task/CODE` links. */
  code: string;
  title: string;
  /** Markdown / plain text description shown to the candidate above the editor. */
  description: string;
  /** Monaco language id (e.g. "javascript", "typescript", "python"). */
  language: string;
  /** Initial editor contents (function signature + comments) the candidate sees. */
  starterCode: string;
  createdAt: number;
  /** Optional human label for the interviewer to remember who this task is for. */
  candidateLabel?: string;
}

export interface PreTaskSubmission {
  /** Final candidate code at the time they hit submit. */
  code: string;
  submittedAt: number;
  /** Optional self-reported name from the candidate at submit time. */
  candidateName?: string;
}

export interface PreTaskState {
  def: PreTaskDef;
  /** `null` until the candidate hits submit (we keep only the latest submission). */
  submission: PreTaskSubmission | null;
}
