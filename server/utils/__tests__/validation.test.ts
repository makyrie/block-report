import { describe, it, expect, vi } from 'vitest';
import { COMMUNITIES_LOWER, LANGUAGE_CODES, VALID_LANGUAGES, VALID_LANGUAGE_CODES, validateCommunity } from '../validation.js';

describe('COMMUNITIES_LOWER', () => {
  it('contains lowercase community names', () => {
    expect(COMMUNITIES_LOWER.has('mira mesa')).toBe(true);
    expect(COMMUNITIES_LOWER.has('Mira Mesa')).toBe(false);
  });

  it('rejects unknown communities', () => {
    expect(COMMUNITIES_LOWER.has('atlantis')).toBe(false);
    expect(COMMUNITIES_LOWER.has('')).toBe(false);
  });
});

describe('LANGUAGE_CODES', () => {
  it('maps language names to codes', () => {
    expect(LANGUAGE_CODES['English']).toBe('en');
    expect(LANGUAGE_CODES['Spanish']).toBe('es');
    expect(LANGUAGE_CODES['Chinese']).toBe('zh');
  });
});

describe('VALID_LANGUAGES', () => {
  it('contains display names', () => {
    expect(VALID_LANGUAGES.has('English')).toBe(true);
    expect(VALID_LANGUAGES.has('en')).toBe(false);
  });
});

describe('VALID_LANGUAGE_CODES', () => {
  it('contains short codes', () => {
    expect(VALID_LANGUAGE_CODES.has('en')).toBe(true);
    expect(VALID_LANGUAGE_CODES.has('English')).toBe(false);
  });
});

function mockReqRes(query: Record<string, unknown> = {}) {
  const req = { query } as any;
  const jsonFn = vi.fn();
  const statusFn = vi.fn(() => ({ json: jsonFn }));
  const res = { status: statusFn, json: jsonFn } as any;
  return { req, res, statusFn, jsonFn };
}

describe('validateCommunity', () => {
  it('returns cleaned name for a valid community', () => {
    const { req, res } = mockReqRes({ community: 'Mira Mesa' });
    const result = validateCommunity(req, res);
    expect(result).toBe('Mira Mesa');
  });

  it('returns 400 when community is missing', () => {
    const { req, res, statusFn } = mockReqRes({});
    const result = validateCommunity(req, res);
    expect(result).toBeNull();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it('strips SQL wildcard characters', () => {
    const { req, res } = mockReqRes({ community: 'Mira%Mesa' });
    const result = validateCommunity(req, res);
    // After stripping %, becomes "MiraMesa" which won't match allowlist
    expect(result).toBeNull();
  });

  it('rejects community names longer than 100 chars', () => {
    const { req, res, statusFn } = mockReqRes({ community: 'A'.repeat(101) });
    const result = validateCommunity(req, res);
    expect(result).toBeNull();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it('rejects unknown community names', () => {
    const { req, res, statusFn } = mockReqRes({ community: '../../etc/passwd' });
    const result = validateCommunity(req, res);
    expect(result).toBeNull();
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it('rejects empty string after wildcard stripping', () => {
    const { req, res, statusFn } = mockReqRes({ community: '%%__' });
    const result = validateCommunity(req, res);
    expect(result).toBeNull();
    expect(statusFn).toHaveBeenCalledWith(400);
  });
});
