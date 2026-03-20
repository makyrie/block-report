import { describe, it, expect } from 'vitest';

/**
 * Unit tests for permits endpoint input validation logic.
 * These test the sanitization rules without requiring a running Express server.
 */

// Mirrors the validation logic in locations.ts GET /permits
function validateCommunity(raw: string | undefined): { valid: boolean; error?: string; cleaned?: string } {
  if (raw === undefined) {
    return { valid: true }; // community is optional
  }
  const cleaned = raw.replace(/[%_]/g, '');
  if (cleaned.length === 0 || cleaned.length > 100) {
    return { valid: false, error: 'Invalid community name' };
  }
  return { valid: true, cleaned };
}

describe('permits community parameter validation', () => {
  it('accepts undefined community (returns all permits)', () => {
    const result = validateCommunity(undefined);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid community name', () => {
    const result = validateCommunity('Mira Mesa');
    expect(result.valid).toBe(true);
    expect(result.cleaned).toBe('Mira Mesa');
  });

  it('strips SQL wildcard characters', () => {
    const result = validateCommunity('Mira%Mesa_');
    expect(result.valid).toBe(true);
    expect(result.cleaned).toBe('MiraMesa');
  });

  it('rejects empty string', () => {
    const result = validateCommunity('');
    expect(result.valid).toBe(false);
  });

  it('rejects string that becomes empty after stripping wildcards', () => {
    const result = validateCommunity('%%%___');
    expect(result.valid).toBe(false);
  });

  it('rejects community names over 100 characters', () => {
    const result = validateCommunity('A'.repeat(101));
    expect(result.valid).toBe(false);
  });

  it('accepts community name at exactly 100 characters', () => {
    const result = validateCommunity('A'.repeat(100));
    expect(result.valid).toBe(true);
  });
});
