// Shared community name normalization — single source of truth for server and frontend.
//
// There are TWO normalization functions in this project, each for a different purpose:
//   1. norm() (this file) — fuzzy display matching on the frontend (spaces preserved).
//      Used for GeoJSON feature matching where "City Heights" ⊂ "Mid-City City Heights".
//   2. communityKey() (server/utils/community.ts) — deterministic cache/lookup keys on
//      the server (hyphens, no spaces). Used for DB keys, report cache, and transit scores.
//
// Do NOT use norm() for server-side cache keys or communityKey() for frontend matching.

/**
 * Normalize strings for fuzzy matching (e.g. "City Heights" matches "Mid-City:City Heights").
 * Lowercase, strip non-alphanumeric, collapse whitespace.
 *
 * WARNING: This is for frontend display matching only. For server-side cache keys, use
 * communityKey() from server/utils/community.ts instead.
 */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert community name to Title Case for display.
 * Handles hyphens and colons as word boundaries.
 */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|\s|[-:])(\w)/g, (_, sep, char) => sep + char.toUpperCase());
}
