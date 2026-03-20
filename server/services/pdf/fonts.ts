/**
 * Google Fonts CSS caching with security hardening.
 *
 * Fetches font CSS once and caches it for 24 hours. The CSS is sanitized:
 * - HTML tags are stripped (prevent injection via compromised CDN)
 * - @import rules are stripped (defense-in-depth against CDN compromise
 *   loading arbitrary external stylesheets)
 */

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;900&family=Noto+Sans+SC:wght@400;700;900&family=Noto+Sans+Arabic:wght@400;700;900&family=Noto+Sans+Vietnamese:wght@400;700&display=swap';
const FONT_CSS_TTL = 24 * 60 * 60 * 1000; // 24 hours
let cachedFontCss: string | null = null;
let fontCssCachedAt = 0;

export async function getGoogleFontsCss(): Promise<string> {
  if (cachedFontCss && Date.now() - fontCssCachedAt < FONT_CSS_TTL) return cachedFontCss;
  try {
    const res = await fetch(GOOGLE_FONTS_URL, {
      headers: {
        // Request woff2 format (Chromium user-agent gets the best format)
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('text/css')) {
      let css = await res.text();
      // Strip any HTML tags to prevent injection via compromised CDN
      css = css.replace(/<[^>]*>/g, '');
      // Strip @import rules — legitimate Google Fonts CSS uses only @font-face
      css = css.replace(/@import\s+[^;]+;/g, '');
      cachedFontCss = css;
      fontCssCachedAt = Date.now();
      return cachedFontCss;
    }
  } catch {
    // Fall through to empty string — fonts will use system fallback
  }
  return cachedFontCss ?? '';
}
