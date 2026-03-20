import { describe, it, expect } from 'vitest';
import { norm } from '../normalize';

describe('norm', () => {
  it('lowercases and trims', () => {
    expect(norm('  MIRA MESA  ')).toBe('mira mesa');
  });

  it('strips non-alphanumeric characters', () => {
    expect(norm('Barrio-Logan!')).toBe('barrio logan');
  });

  it('collapses multiple spaces', () => {
    expect(norm('San   Ysidro')).toBe('san ysidro');
  });

  it('returns empty string for empty input', () => {
    expect(norm('')).toBe('');
  });

  it('handles mixed case with special chars', () => {
    expect(norm("Scripps Ranch / Miramar")).toBe('scripps ranch miramar');
  });
});
