import { describe, it, expect } from 'vitest';
import { haversineDistanceMiles, SD_BOUNDS } from './geo.js';

describe('haversineDistanceMiles', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceMiles(32.9, -117.1, 32.9, -117.1)).toBe(0);
  });

  it('returns correct distance for known San Diego points', () => {
    // Mira Mesa library (~32.9155, -117.1436) to Scripps Ranch library (~32.9026, -117.1003)
    const dist = haversineDistanceMiles(32.9155, -117.1436, 32.9026, -117.1003);
    expect(dist).toBeGreaterThan(2);
    expect(dist).toBeLessThan(4);
  });

  it('is symmetric', () => {
    const d1 = haversineDistanceMiles(32.7, -117.1, 32.8, -117.2);
    const d2 = haversineDistanceMiles(32.8, -117.2, 32.7, -117.1);
    expect(d1).toBeCloseTo(d2, 10);
  });
});

describe('SD_BOUNDS', () => {
  it('contains central San Diego', () => {
    const lat = 32.7157;
    const lng = -117.1611;
    expect(lat).toBeGreaterThanOrEqual(SD_BOUNDS.latMin);
    expect(lat).toBeLessThanOrEqual(SD_BOUNDS.latMax);
    expect(lng).toBeGreaterThanOrEqual(SD_BOUNDS.lngMin);
    expect(lng).toBeLessThanOrEqual(SD_BOUNDS.lngMax);
  });

  it('excludes Los Angeles', () => {
    const lat = 34.05;
    expect(lat).toBeGreaterThan(SD_BOUNDS.latMax);
  });
});
