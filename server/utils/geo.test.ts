import { describe, it, expect } from 'vitest';
import type { Polygon, MultiPolygon } from 'geojson';
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
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [squareRing],
    };
    expect(pointInFeature(5, 5, geometry)).toBe(true);
    expect(pointInFeature(15, 15, geometry)).toBe(false);
  });

  it('returns false for a point inside a polygon hole', () => {
    const hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]];
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [squareRing, hole],
    };
    // Inside the hole — should be false
    expect(pointInFeature(5, 5, geometry)).toBe(false);
    // Outside the hole but inside outer ring — should be true
    expect(pointInFeature(1, 1, geometry)).toBe(true);
    // Outside entirely — should be false
    expect(pointInFeature(15, 15, geometry)).toBe(false);
  });

  it('returns false for a point inside a MultiPolygon hole', () => {
    const hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]];
    const geometry: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [[squareRing, hole]],
    };
    expect(pointInFeature(5, 5, geometry)).toBe(false);
    expect(pointInFeature(1, 1, geometry)).toBe(true);
  });

  it('works with MultiPolygon geometry', () => {
    const geometry: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [[squareRing]],
    };
    expect(pointInFeature(5, 5, geometry)).toBe(true);
    expect(pointInFeature(15, 15, geometry)).toBe(false);
  });

  it('excludes points inside polygon holes', () => {
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [
        // outer: (0,0) to (20,20)
        [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
        // hole: (5,5) to (15,15)
        [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]],
      ],
    };
    // Inside hole → should return false
    expect(pointInFeature(10, 10, geometry)).toBe(false);
    // Inside outer but outside hole → should return true
    expect(pointInFeature(2, 2, geometry)).toBe(true);
  });

  it('excludes points inside MultiPolygon holes', () => {
    const geometry: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
          [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]],
        ],
      ],
    };
    expect(pointInFeature(10, 10, geometry)).toBe(false);
    expect(pointInFeature(2, 2, geometry)).toBe(true);
  });
});

describe('computeBBox', () => {
  it('computes bounding box for a Polygon', () => {
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [squareRing],
    };
    const bbox = computeBBox(geometry);
    expect(bbox.minLat).toBe(0);
    expect(bbox.maxLat).toBe(10);
    expect(bbox.minLng).toBe(0);
    expect(bbox.maxLng).toBe(10);
  });

  it('computes bounding box for a MultiPolygon', () => {
    const ring2 = [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]];
    const geometry: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [[squareRing], [ring2]],
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
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [squareRing],
    };
    const centroid = computeCentroid(geometry);
    expect(centroid).not.toBeNull();
    // Average of [0,0],[10,0],[10,10],[0,10],[0,0] → lat≈4, lng≈4
    expect(centroid!.lat).toBeCloseTo(4, 0);
    expect(centroid!.lng).toBeCloseTo(4, 0);
  });

  it('returns null for empty geometry', () => {
    const geometry: Polygon = { type: 'Polygon', coordinates: [[]] };
    expect(computeCentroid(geometry)).toBeNull();
  });
});
