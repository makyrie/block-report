/**
 * Validate that a URL string uses a safe protocol (http or https).
 * Used to guard user-provided URLs before rendering them as links.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
