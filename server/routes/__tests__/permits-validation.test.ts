import { describe, it, expect } from 'vitest';
import { sanitizeCommunity } from '../../utils/validation.js';

describe('permits community parameter validation', () => {
  it('accepts undefined community (returns all permits)', () => {
    const result = sanitizeCommunity(undefined);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid community name', () => {
    const result = sanitizeCommunity('Mira Mesa');
    expect(result.valid).toBe(true);
    expect(result.valid && result.cleaned).toBe('Mira Mesa');
  });

  it('strips SQL wildcard characters', () => {
    const result = sanitizeCommunity('Mira%Mesa_');
    expect(result.valid).toBe(true);
    expect(result.valid && result.cleaned).toBe('MiraMesa');
  });

  it('rejects empty string', () => {
    const result = sanitizeCommunity('');
    expect(result.valid).toBe(false);
  });

  it('rejects string that becomes empty after stripping wildcards', () => {
    const result = sanitizeCommunity('%%%___');
    expect(result.valid).toBe(false);
  });

  it('rejects community names over 100 characters', () => {
    const result = sanitizeCommunity('A'.repeat(101));
    expect(result.valid).toBe(false);
  });

  it('accepts community name at exactly 100 characters', () => {
    const result = sanitizeCommunity('A'.repeat(100));
    expect(result.valid).toBe(true);
  });
});
