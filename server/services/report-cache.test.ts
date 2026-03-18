import { describe, it, expect } from 'vitest';
import { buildBlockCacheKey } from './report-cache.js';

describe('buildBlockCacheKey', () => {
  it('rounds lat/lng to 4 decimal places', () => {
    const key = buildBlockCacheKey(32.91553, -117.14361, 0.25, 'en');
    expect(key).toBe('addr_32.9155_-117.1436_0.25_en');
  });

  it('clamps radius to valid range', () => {
    const tooSmall = buildBlockCacheKey(32.9, -117.1, 0.01, 'en');
    expect(tooSmall).toContain('_0.1_');

    const tooLarge = buildBlockCacheKey(32.9, -117.1, 10, 'en');
    expect(tooLarge).toContain('_2_');
  });

  it('defaults NaN radius to 0.25', () => {
    const key = buildBlockCacheKey(32.9, -117.1, NaN, 'en');
    expect(key).toContain('_0.25_');
  });

  it('produces identical keys for same inputs', () => {
    const k1 = buildBlockCacheKey(32.9155, -117.1436, 0.25, 'es');
    const k2 = buildBlockCacheKey(32.9155, -117.1436, 0.25, 'es');
    expect(k1).toBe(k2);
  });

  it('produces different keys for different locations', () => {
    const k1 = buildBlockCacheKey(32.9155, -117.1436, 0.25, 'en');
    const k2 = buildBlockCacheKey(32.7157, -117.1611, 0.25, 'en');
    expect(k1).not.toBe(k2);
  });
});
