import { describe, it, expect } from 'vitest';
import { pointInPolygon, pointInFeature, computeBBox, pointInBBox, haversineDistanceMiles, computeCentroid } from './geo';

// A simple square polygon: [lng, lat] pairs forming a square from (0,0) to (10,10)
// GeoJSON convention: [lng, lat]
const squareRing = [
  [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
];

describe('pointInPolygon', () => {
  it('returns true for a point inside the polygon', () => {
    expect(pointInPolygon(5, 5, squareRing)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(pointInPolygon(15, 15, squareRing)).toBe(false);
    expect(pointInPolygon(-1, 5, squareRing)).toBe(false);
  });

  it('returns false for a point clearly outside', () => {
    expect(pointInPolygon(100, 100, squareRing)).toBe(false);
  });
});

describe('pointInFeature', () => {
  it('works with Polygon geometry', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [squareRing] as number[][][],
    };
    expect(pointInFeature(5, 5, geometry)).toBe(true);
    expect(pointInFeature(15, 15, geometry)).toBe(false);
  });

  it('works with MultiPolygon geometry', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [[squareRing]] as number[][][][],
    };
    expect(pointInFeature(5, 5, geometry)).toBe(true);
    expect(pointInFeature(15, 15, geometry)).toBe(false);
  });

  it('returns false for unsupported geometry types', () => {
    const geometry = {
      type: 'Point',
      coordinates: [5, 5] as unknown as number[][][],
    };
    expect(pointInFeature(5, 5, geometry)).toBe(false);
  });
});

describe('computeBBox', () => {
  it('computes bounding box for a Polygon', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [squareRing] as number[][][],
    };
    const bbox = computeBBox(geometry);
    expect(bbox.minLat).toBe(0);
    expect(bbox.maxLat).toBe(10);
    expect(bbox.minLng).toBe(0);
    expect(bbox.maxLng).toBe(10);
  });

  it('computes bounding box for a MultiPolygon', () => {
    const ring2 = [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]];
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [[squareRing], [ring2]] as number[][][][],
    };
    const bbox = computeBBox(geometry);
    expect(bbox.minLat).toBe(0);
    expect(bbox.maxLat).toBe(30);
    expect(bbox.minLng).toBe(0);
    expect(bbox.maxLng).toBe(30);
  });
});

describe('pointInBBox', () => {
  const bbox = { minLat: 0, maxLat: 10, minLng: 0, maxLng: 10 };

  it('returns true for points inside bbox', () => {
    expect(pointInBBox(5, 5, bbox)).toBe(true);
    expect(pointInBBox(0, 0, bbox)).toBe(true);
    expect(pointInBBox(10, 10, bbox)).toBe(true);
  });

  it('returns false for points outside bbox', () => {
    expect(pointInBBox(-1, 5, bbox)).toBe(false);
    expect(pointInBBox(5, 11, bbox)).toBe(false);
  });
});

describe('haversineDistanceMiles', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceMiles(32.7, -117.1, 32.7, -117.1)).toBe(0);
  });

  it('computes approximate distance between known points', () => {
    // San Diego to Los Angeles is roughly 120 miles
    const dist = haversineDistanceMiles(32.7157, -117.1611, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(130);
  });
});

describe('computeCentroid', () => {
  it('returns centroid of a simple polygon', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [squareRing] as number[][][],
    };
    const centroid = computeCentroid(geometry);
    expect(centroid).not.toBeNull();
    // Average of [0,0],[10,0],[10,10],[0,10],[0,0] → lat≈4, lng≈4
    expect(centroid!.lat).toBeCloseTo(4, 0);
    expect(centroid!.lng).toBeCloseTo(4, 0);
  });

  it('returns null for empty geometry', () => {
    const geometry = { type: 'Polygon', coordinates: [[]] as number[][][] };
    expect(computeCentroid(geometry)).toBeNull();
  });
});
