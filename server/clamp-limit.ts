/** Clamp a raw query-string limit to a safe integer in [1, 100], defaulting to 10. */
export function clampLimit(raw: unknown): number {
  return Math.max(1, Math.min(Number(raw) || 10, 100));
}
