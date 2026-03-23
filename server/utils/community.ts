// Shared community name normalization and validation for server routes

/**
 * Canonical key for community lookups. Strips non-alphanumeric characters and
 * uppercases for consistent matching across data sources (311, transit, census).
 * Frontend uses its own norm() (lowercase) for display matching — that's fine
 * because the two domains don't share lookup maps directly.
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
