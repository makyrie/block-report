import { describe, it, expect } from 'vitest';
import { sanitizeCommunity } from '../../utils/validation.js';

describe('permits community parameter validation', () => {
  it('returns undefined for undefined input (no filter)', () => {
    expect(sanitizeCommunity(undefined)).toBeUndefined();
  });

  it('accepts a valid community name', () => {
    expect(sanitizeCommunity('Mira Mesa')).toBe('Mira Mesa');
  });

  it('allows hyphens, periods, and apostrophes', () => {
    expect(sanitizeCommunity("Mid-City")).toBe('Mid-City');
    expect(sanitizeCommunity("O'Farrell")).toBe("O'Farrell");
    expect(sanitizeCommunity("St. Luke's")).toBe("St. Luke's");
  });

  it('strips disallowed characters (SQL wildcards, quotes, semicolons)', () => {
    expect(sanitizeCommunity('Mira%Mesa_')).toBe('MiraMesa');
    expect(sanitizeCommunity('Mira;Mesa')).toBe('MiraMesa');
    expect(sanitizeCommunity('Mira"Mesa')).toBe('MiraMesa');
  });

  it('returns null for empty string', () => {
    expect(sanitizeCommunity('')).toBeNull();
  });

  it('returns null for string that becomes empty after stripping', () => {
    expect(sanitizeCommunity('%%%___')).toBeNull();
  });

  it('returns null for community names over 100 characters', () => {
    expect(sanitizeCommunity('A'.repeat(101))).toBeNull();
  });

  it('accepts community name at exactly 100 characters', () => {
    expect(sanitizeCommunity('A'.repeat(100))).toBe('A'.repeat(100));
  });
});
