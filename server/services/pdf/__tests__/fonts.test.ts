import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGoogleFontsCss } from '../fonts.js';

describe('getGoogleFontsCss', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should strip HTML tags from response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/css']]) as unknown as Headers,
      text: () => Promise.resolve('@font-face { font-family: "Noto"; }<script>alert(1)</script>'),
    }));

    const css = await getGoogleFontsCss();
    expect(css).not.toContain('<script>');
    expect(css).toContain('@font-face');
  });

  it('should strip @import rules', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/css']]) as unknown as Headers,
      text: () => Promise.resolve('@import url("evil.css"); @font-face { }'),
    }));

    const css = await getGoogleFontsCss();
    expect(css).not.toContain('@import');
    expect(css).toContain('@font-face');
  });

  it('should return empty string on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const css = await getGoogleFontsCss();
    expect(typeof css).toBe('string');
  });

  it('should return empty string on non-CSS content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]) as unknown as Headers,
      text: () => Promise.resolve('<html>not css</html>'),
    }));

    const css = await getGoogleFontsCss();
    // Should not contain HTML since it wasn't accepted as CSS
    expect(css).not.toContain('<html>');
  });
});
