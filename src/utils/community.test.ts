import { describe, it, expect } from 'vitest';
import { scoreToColor, norm, titleCase, escapeHtml, ACCESS_GAP_COLORS, NO_DATA_COLOR } from './community';

describe('scoreToColor', () => {
  it('returns first color for scores <= 20', () => {
    expect(scoreToColor(0)).toBe(ACCESS_GAP_COLORS[0]);
    expect(scoreToColor(20)).toBe(ACCESS_GAP_COLORS[0]);
  });

  it('returns second color for scores 21-40', () => {
    expect(scoreToColor(21)).toBe(ACCESS_GAP_COLORS[1]);
    expect(scoreToColor(40)).toBe(ACCESS_GAP_COLORS[1]);
  });

  it('returns third color for scores 41-60', () => {
    expect(scoreToColor(41)).toBe(ACCESS_GAP_COLORS[2]);
    expect(scoreToColor(60)).toBe(ACCESS_GAP_COLORS[2]);
  });

  it('returns fourth color for scores 61-80', () => {
    expect(scoreToColor(61)).toBe(ACCESS_GAP_COLORS[3]);
    expect(scoreToColor(80)).toBe(ACCESS_GAP_COLORS[3]);
  });

  it('returns fifth color for scores > 80', () => {
    expect(scoreToColor(81)).toBe(ACCESS_GAP_COLORS[4]);
    expect(scoreToColor(100)).toBe(ACCESS_GAP_COLORS[4]);
  });

  it('handles negative scores', () => {
    expect(scoreToColor(-1)).toBe(ACCESS_GAP_COLORS[0]);
    expect(scoreToColor(-100)).toBe(ACCESS_GAP_COLORS[0]);
  });

  it('handles NaN gracefully', () => {
    // NaN comparisons are all false, so it falls through to the last return
    const result = scoreToColor(NaN);
    expect(ACCESS_GAP_COLORS).toContain(result);
  });
});

describe('norm', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(norm('MIRA MESA')).toBe('mira mesa');
    expect(norm('Mid-City:City Heights')).toBe('mid city city heights');
  });

  it('collapses whitespace', () => {
    expect(norm('  Barrio   Logan  ')).toBe('barrio logan');
  });

  it('handles empty string', () => {
    expect(norm('')).toBe('');
  });
});

describe('titleCase', () => {
  it('converts uppercase to title case', () => {
    expect(titleCase('MIRA MESA')).toBe('Mira Mesa');
    expect(titleCase('BARRIO LOGAN')).toBe('Barrio Logan');
  });

  it('handles already title-cased input', () => {
    expect(titleCase('Mira Mesa')).toBe('Mira Mesa');
  });

  it('handles single word', () => {
    expect(titleCase('DOWNTOWN')).toBe('Downtown');
  });
});

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('AT&T')).toBe('AT&amp;T');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Mira Mesa')).toBe('Mira Mesa');
  });

  it('handles img onerror XSS payload', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
  });
});
