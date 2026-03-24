import { describe, it, expect } from 'vitest';
import { validateCommunityParam, communityKey } from './community.js';

describe('validateCommunityParam', () => {
  it('returns null for undefined input', () => {
    expect(validateCommunityParam(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateCommunityParam('')).toBeNull();
  });

  it('strips SQL wildcard %', () => {
    expect(validateCommunityParam('Mira%Mesa')).toBe('MiraMesa');
  });

  it('strips SQL wildcard _', () => {
    expect(validateCommunityParam('Mira_Mesa')).toBe('MiraMesa');
  });

  it('strips multiple wildcards', () => {
    expect(validateCommunityParam('%Mira_Mesa%')).toBe('MiraMesa');
  });

  it('returns null if string is only wildcards', () => {
    expect(validateCommunityParam('%%__')).toBeNull();
  });

  it('returns null if cleaned string exceeds 100 characters', () => {
    expect(validateCommunityParam('a'.repeat(101))).toBeNull();
  });

  it('accepts valid community name', () => {
    expect(validateCommunityParam('Mira Mesa')).toBe('Mira Mesa');
  });

  it('accepts string at exactly 100 characters', () => {
    const input = 'a'.repeat(100);
    expect(validateCommunityParam(input)).toBe(input);
  });
});

describe('communityKey', () => {
  it('uppercases and trims', () => {
    expect(communityKey('  mira mesa  ')).toBe('MIRA MESA');
  });
});
