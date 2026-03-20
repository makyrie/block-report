/**
 * Normalize a community name for fuzzy matching (lowercase, strip non-alphanumeric, collapse whitespace).
 * NOTE: The server uses `.toUpperCase().trim()` for its own lookups (gap-analysis, etc.).
 * The two strategies never compare keys across the client/server boundary — each side
 * normalizes consistently within its own context.
 */
export function normalizeCommunityName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}
