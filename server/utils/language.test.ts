import { describe, it, expect } from 'vitest';
import { sanitizeFilename, getLangCode, VALID_LANGUAGES, LANGUAGE_CODES } from './language.js';

describe('sanitizeFilename', () => {
  it('lowercases and replaces non-alnum with hyphens', () => {
    expect(sanitizeFilename('Mira Mesa')).toBe('mira-mesa');
  });

  it('collapses multiple hyphens', () => {
    expect(sanitizeFilename('Barrio---Logan')).toBe('barrio-logan');
  });

  it('strips leading/trailing hyphens', () => {
    expect(sanitizeFilename('--hello--')).toBe('hello');
  });

  it('handles special characters', () => {
    expect(sanitizeFilename('San Diego (Central)')).toBe('san-diego-central');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('getLangCode', () => {
  it('returns correct code for known languages', () => {
    expect(getLangCode('English')).toBe('en');
    expect(getLangCode('Spanish')).toBe('es');
    expect(getLangCode('Vietnamese')).toBe('vi');
  });

  it('falls back to lowercase first 2 chars for unknown languages', () => {
    expect(getLangCode('Swahili')).toBe('sw');
  });
});

describe('VALID_LANGUAGES', () => {
  it('includes English and Spanish', () => {
    expect(VALID_LANGUAGES.has('English')).toBe(true);
    expect(VALID_LANGUAGES.has('Spanish')).toBe(true);
  });

  it('does not include arbitrary strings', () => {
    expect(VALID_LANGUAGES.has('Klingon')).toBe(false);
  });

  it('matches LANGUAGE_CODES keys', () => {
    expect([...VALID_LANGUAGES].sort()).toEqual(Object.keys(LANGUAGE_CODES).sort());
  });
});
