// Shared community name normalization and validation for server routes

/**
 * Canonical key for ALL server-side community lookups: transit scores,
 * gap analysis maps, and report cache keys.
 *
 * Lowercase, strip non-alphanumeric to hyphens, trim leading/trailing hyphens.
 * Examples: "Mira Mesa" → "mira-mesa", "Mid-City: City Heights" → "mid-city-city-heights"
 *
 * WARNING: This produces DIFFERENT output from norm() in types/community.ts.
 * norm() uses spaces for fuzzy frontend matching; communityKey() uses hyphens
 * for deterministic server-side keys. Do NOT mix them.
 */
export function communityKey(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
