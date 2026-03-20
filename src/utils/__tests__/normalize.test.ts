import { describe, it, expect } from 'vitest';
import { normalizeCommunityName } from '../normalize';

describe('normalizeCommunityName', () => {
  it('lowercases and trims', () => {
    expect(normalizeCommunityName('  MIRA MESA  ')).toBe('mira mesa');
  });

  it('strips non-alphanumeric characters', () => {
    expect(normalizeCommunityName('Barrio-Logan!')).toBe('barrio logan');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeCommunityName('San   Ysidro')).toBe('san ysidro');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeCommunityName('')).toBe('');
  });

  it('handles mixed case with special chars', () => {
    expect(normalizeCommunityName("Scripps Ranch / Miramar")).toBe('scripps ranch miramar');
  });
});
