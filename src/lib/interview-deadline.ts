/** Absolute interview end time (ms) from server-authoritative timer fields. */
export function interviewDeadlineMs(
  interviewStartedAt: number | null,
  durationMinutes: number,
  timeExtensionMinutes: number
): number | null {
  if (interviewStartedAt == null) return null;
  return interviewStartedAt + (durationMinutes + timeExtensionMinutes) * 60 * 1000;
}

export function interviewDurationMinutes(config: unknown): number {
  if (config !== null && typeof config === "object" && "duration" in config) {
    const d = (config as { duration: unknown }).duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  }
  return 30;
}

/** Extension minutes after adding time — extends from now when the block is already past deadline. */
export function nextTimeExtensionMinutes(
  interviewStartedAt: number | null,
  durationMinutes: number,
  currentExtensionMinutes: number,
  addMinutes: 30 | 60
): number {
  const add = addMinutes === 60 ? 60 : 30;
  if (interviewStartedAt == null) return currentExtensionMinutes + add;

  const addMs = add * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;
  const now = Date.now();
  const currentDeadline =
    interviewStartedAt + durationMs + currentExtensionMinutes * 60 * 1000;
  const newDeadline = Math.max(currentDeadline, now) + addMs;
  return Math.max(
    currentExtensionMinutes,
    Math.round((newDeadline - interviewStartedAt - durationMs) / 60000)
  );
}
