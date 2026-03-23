// Shared community name normalization — single source of truth for server and frontend.

/**
 * Normalize strings for fuzzy matching (e.g. "City Heights" matches "Mid-City:City Heights").
 * Lowercase, strip non-alphanumeric, collapse whitespace.
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
