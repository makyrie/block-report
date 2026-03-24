import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../template.js';

describe('escapeHtml', () => {
  it('should escape HTML special characters in strings', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should handle numeric values', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(3.14)).toBe('3.14');
    expect(escapeHtml(0)).toBe('0');
  });

  it('should handle null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should handle numbers that look like HTML', () => {
    // Defense-in-depth: even though numbers are validated upstream,
    // escapeHtml should handle any value safely
    expect(escapeHtml('1<2')).toBe('1&lt;2');
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should pass through safe strings unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});
