import { describe, it, expect } from 'vitest';
import { buildHtmlPage } from './pdf.js';

describe('buildHtmlPage', () => {
  it('produces dir="rtl" and lang="ar" for Arabic', () => {
    const html = buildHtmlPage('<p>Hello</p>', 'Arabic');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
  });

  it('produces dir="ltr" for non-Arabic languages', () => {
    for (const lang of ['English', 'Spanish', 'Vietnamese', 'Tagalog', 'Chinese']) {
      const html = buildHtmlPage('<p>Hello</p>', lang);
      expect(html).toContain('dir="ltr"');
      expect(html).not.toContain('dir="rtl"');
    }
  });

  it('does not include Tailwind CDN script tag', () => {
    const html = buildHtmlPage('<p>Test</p>', 'English');
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).not.toContain('<script');
  });

  it('loads only Chinese font for Chinese language', () => {
    const html = buildHtmlPage('<p>Test</p>', 'Chinese');
    expect(html).toContain('Noto+Sans+SC');
    expect(html).not.toContain('Noto+Sans+Arabic');
  });

  it('loads only Arabic font for Arabic language', () => {
    const html = buildHtmlPage('<p>Test</p>', 'Arabic');
    expect(html).toContain('Noto+Sans+Arabic');
    expect(html).not.toContain('Noto+Sans+SC');
  });

  it('loads Noto Sans for Latin-script languages', () => {
    const html = buildHtmlPage('<p>Test</p>', 'English');
    expect(html).toContain('family=Noto+Sans:');
    expect(html).not.toContain('Noto+Sans+SC');
    expect(html).not.toContain('Noto+Sans+Arabic');
  });

  it('includes the body HTML in the output', () => {
    const body = '<div class="test">Content here</div>';
    const html = buildHtmlPage(body, 'English');
    expect(html).toContain(body);
  });
});
