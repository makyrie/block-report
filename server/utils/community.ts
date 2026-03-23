// Shared community name normalization and validation for server routes

/**
 * Canonical key for community lookups. Strips non-alphanumeric characters and
 * uppercases for consistent matching across data sources (311, transit, census).
 * Intentionally different from:
 * - frontend norm() (lowercase + spaces) — display matching only
 * - report-cache normalizeKey() (lowercase + dashes) — cache key storage only
 * Each normalizer only compares within its own domain, so the differences are safe.
 */
export function communityKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/**
 * Validate and sanitize a community name from user input.
 * Returns the cleaned string, or null if invalid.
 */
export function validateCommunityParam(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[%_]/g, '');
  if (cleaned.length === 0 || cleaned.length > 100) return null;
  return cleaned;
}
