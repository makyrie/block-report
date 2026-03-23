import { describe, it, expect } from 'vitest';
import { communityKey, validateCommunityParam } from './community';

describe('communityKey', () => {
  it('uppercases and trims', () => {
    expect(communityKey('  Mira Mesa  ')).toBe('MIRA MESA');
  });

  it('strips non-alphanumeric characters for consistent matching', () => {
    expect(communityKey('Mid-City:City Heights')).toBe('MID CITY CITY HEIGHTS');
  });

  it('normalizes multiple spaces to single space', () => {
    expect(communityKey('Barrio  Logan')).toBe('BARRIO LOGAN');
  });
});

describe('validateCommunityParam', () => {
  it('returns null for undefined', () => {
    expect(validateCommunityParam(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateCommunityParam('')).toBeNull();
  });

  it('strips SQL wildcard characters', () => {
    expect(validateCommunityParam('Mira%Mesa_')).toBe('MiraMesa');
  });

  it('returns null for strings over 100 characters', () => {
    expect(validateCommunityParam('a'.repeat(101))).toBeNull();
  });

  it('returns cleaned string for valid input', () => {
    expect(validateCommunityParam('Mira Mesa')).toBe('Mira Mesa');
  });

  it('returns null when only wildcard characters', () => {
    expect(validateCommunityParam('%_')).toBeNull();
  });
});
