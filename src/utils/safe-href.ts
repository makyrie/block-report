/** Only allow http/https URLs — neutralizes javascript: and data: protocols */
export function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url, 'https://placeholder.invalid');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch { /* malformed URL */ }
  return undefined;
}
