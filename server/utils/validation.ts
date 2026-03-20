/**
 * Sanitize and validate a community name query parameter.
 * Returns the cleaned string if valid, or null if invalid.
 * Returns undefined if the input is undefined (parameter not provided).
 */
export function sanitizeCommunity(
  raw: string | undefined
): { valid: true; cleaned?: string } | { valid: false; error: string } {
  if (raw === undefined) {
    return { valid: true };
  }
  const cleaned = raw.replace(/[%_]/g, '');
  if (cleaned.length === 0 || cleaned.length > 100) {
    return { valid: false, error: 'Invalid community name' };
  }
  return { valid: true, cleaned };
}
