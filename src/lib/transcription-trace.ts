/** Dev-only prefix for filtering the browser console. */
const PREFIX = "[transcription]";

export function transcriptionTrace(...args: unknown[]) {
  if (process.env.NODE_ENV !== "development") return;
  console.log(PREFIX, ...args);
}

export function transcriptionTraceWarn(...args: unknown[]) {
  if (process.env.NODE_ENV !== "development") return;
  console.warn(PREFIX, ...args);
}
