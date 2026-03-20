/**
 * Sanitize and validate a community name query parameter.
 * Returns the cleaned string if valid, null if invalid, or undefined if not provided.
 * Only letters, spaces, hyphens, periods, and apostrophes are allowed.
 */
export function sanitizeCommunity(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.replace(/[^a-zA-Z\s\-'.]/g, '').trim();
  if (cleaned.length === 0 || cleaned.length > 100) return null;
  return cleaned;
}
