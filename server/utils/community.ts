// Shared community name normalization and validation for server routes

/**
 * Canonical key for community lookups. All server-side maps use UPPERCASE keys.
 * Frontend uses its own norm() (lowercase) for display matching — that's fine
 * because the two domains don't share lookup maps directly.
 */
export function communityKey(name: string): string {
  return name.toUpperCase().trim();
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
