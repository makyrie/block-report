/** Clamp a raw query-string limit to a safe integer in [1, 100], defaulting to 10. */
export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100) : 10;
}
