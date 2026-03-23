// Shared community name normalization and validation for server routes
//
// Two normalization strategies, co-located here as the single source of truth:
// - communityKey: UPPERCASE for in-memory Map lookups (gap-analysis, transit-scores)
// - normalizeKey: lowercase-dashed for filesystem/DB cache keys (report-cache)
// The frontend uses its own norm() (lowercase, space-separated) for display matching.

/**
 * Canonical key for community lookups. All server-side maps use UPPERCASE keys.
 */
export function communityKey(name: string): string {
  return name.toUpperCase().trim();
}

/**
 * Filesystem/DB-safe cache key. Lowercased, non-alphanumeric collapsed to dashes.
 */
export function normalizeKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
