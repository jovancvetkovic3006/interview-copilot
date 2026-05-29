/** Shared client + API rules for generating a post-interview report without a recording. */

export const MIN_INTERVIEWER_SESSION_NOTES_CHARS = 30;

export function hasUsableTranscript(
  entries: { text?: string }[] | null | undefined
): boolean {
  if (!entries || entries.length === 0) return false;
  return entries.some((e) => typeof e.text === "string" && e.text.trim().length > 0);
}

/** Optional host notes meet the UI hint minimum (report quality, not a hard block). */
export function sessionNotesMeetMinimum(notes: string | null | undefined): boolean {
  return (notes ?? "").trim().length >= MIN_INTERVIEWER_SESSION_NOTES_CHARS;
}
