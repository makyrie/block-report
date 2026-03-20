/** Normalize a community name for fuzzy matching (lowercase, strip non-alphanumeric, collapse whitespace). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}
