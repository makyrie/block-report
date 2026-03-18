import { describe, it, expect } from 'vitest';
import { haversineDistanceMiles } from '../geo.js';

describe('haversineDistanceMiles', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceMiles(32.7, -117.1, 32.7, -117.1)).toBe(0);
  });

  it('calculates distance between two San Diego locations', () => {
    // Mira Mesa (~32.9155, -117.1430) to downtown SD (~32.7157, -117.1611)
    const dist = haversineDistanceMiles(32.9155, -117.143, 32.7157, -117.1611);
    // Should be roughly 13-14 miles
    expect(dist).toBeGreaterThan(13);
    expect(dist).toBeLessThan(15);
  });

  it('calculates short distances accurately', () => {
    // Two points ~0.25 miles apart in Mira Mesa
    const dist = haversineDistanceMiles(32.9155, -117.143, 32.919, -117.143);
    expect(dist).toBeGreaterThan(0.2);
    expect(dist).toBeLessThan(0.3);
  });

  it('is symmetric', () => {
    const d1 = haversineDistanceMiles(32.9, -117.1, 32.7, -117.2);
    const d2 = haversineDistanceMiles(32.7, -117.2, 32.9, -117.1);
    expect(d1).toBeCloseTo(d2, 10);
  });
});
