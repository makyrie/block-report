/**
 * Normalize a community name for fuzzy matching (lowercase, strip non-alphanumeric, collapse whitespace).
 * Shared by both client and server to ensure consistent community name keys.
 */
export function normalizeCommunityName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}
