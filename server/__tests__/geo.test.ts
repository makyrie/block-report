import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { haversineDistanceMiles, pointInPolygon, pointInFeature } from '../services/geo.js';

describe('haversineDistanceMiles', () => {
  it('returns 0 for identical points', () => {
    assert.equal(haversineDistanceMiles(32.7, -117.1, 32.7, -117.1), 0);
  });

  it('computes distance between San Diego and LA (~120 mi)', () => {
    const dist = haversineDistanceMiles(32.7157, -117.1611, 34.0522, -118.2437);
    assert.ok(dist > 110 && dist < 130, `Expected ~120 miles, got ${dist}`);
  });

  it('is symmetric', () => {
    const ab = haversineDistanceMiles(32.7, -117.1, 34.0, -118.2);
    const ba = haversineDistanceMiles(34.0, -118.2, 32.7, -117.1);
    assert.ok(Math.abs(ab - ba) < 0.001);
  });
});

describe('pointInPolygon', () => {
  // Simple square polygon: [lng, lat] coordinates
  // Square from (0,0) to (10,10)
  const square: number[][] = [
    [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
  ];

  it('returns true for point inside', () => {
    assert.equal(pointInPolygon(5, 5, square), true);
  });

  it('returns false for point outside', () => {
    assert.equal(pointInPolygon(15, 15, square), false);
  });

  it('returns false for point clearly outside', () => {
    assert.equal(pointInPolygon(-5, -5, square), false);
  });
});

describe('pointInFeature', () => {
  const polygonGeometry = {
    type: 'Polygon' as const,
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] as number[][][],
  };

  const multiPolygonGeometry = {
    type: 'MultiPolygon' as const,
    coordinates: [
      [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
      [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
    ] as number[][][][],
  };

  it('detects point inside Polygon', () => {
    assert.equal(pointInFeature(5, 5, polygonGeometry), true);
  });

  it('detects point outside Polygon', () => {
    assert.equal(pointInFeature(15, 15, polygonGeometry), false);
  });

  it('detects point inside first polygon of MultiPolygon', () => {
    assert.equal(pointInFeature(2, 2, multiPolygonGeometry), true);
  });

  it('detects point inside second polygon of MultiPolygon', () => {
    assert.equal(pointInFeature(25, 25, multiPolygonGeometry), true);
  });

  it('detects point outside all polygons of MultiPolygon', () => {
    assert.equal(pointInFeature(15, 15, multiPolygonGeometry), false);
  });

  it('returns false for unknown geometry type', () => {
    assert.equal(pointInFeature(5, 5, { type: 'Point', coordinates: [[5, 5]] as unknown as number[][][] }), false);
  });
});
