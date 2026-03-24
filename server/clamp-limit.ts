/** Clamp a raw query-string limit to a safe integer in [1, 100], defaulting to 10. */
export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  if (n <= 0) return 1;
  return Math.min(Math.floor(n), 100);
}
