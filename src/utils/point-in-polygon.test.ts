import { describe, it, expect } from 'vitest';
import { findCommunityAtPoint } from './point-in-polygon';
import type { FeatureCollection } from 'geojson';

// Simple square polygon: (0,0) to (10,10) in lng,lat
const squareBoundaries: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { cpname: 'TestSquare' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        ],
      },
    },
  ],
};

// Polygon with a hole: outer (0,0)-(20,20), hole (5,5)-(15,15)
const donutBoundaries: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { cpname: 'Donut' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
          [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]],
        ],
      },
    },
  ],
};

describe('findCommunityAtPoint', () => {
  it('returns community name for point inside polygon', () => {
    expect(findCommunityAtPoint(5, 5, squareBoundaries)).toBe('TestSquare');
  });

  it('returns null for point outside polygon', () => {
    expect(findCommunityAtPoint(15, 15, squareBoundaries)).toBeNull();
  });

  it('returns community for point in outer ring but not in hole', () => {
    // Point at (2, 2) — inside outer ring, outside hole
    expect(findCommunityAtPoint(2, 2, donutBoundaries)).toBe('Donut');
  });

  it('returns null for point inside hole of donut polygon', () => {
    // Point at (10, 10) — inside the hole
    expect(findCommunityAtPoint(10, 10, donutBoundaries)).toBeNull();
  });

  it('returns null for empty feature collection', () => {
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    expect(findCommunityAtPoint(5, 5, empty)).toBeNull();
  });

  it('handles MultiPolygon geometry', () => {
    const multi: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { cpname: 'Multi' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
              [[[10, 10], [15, 10], [15, 15], [10, 15], [10, 10]]],
            ],
          },
        },
      ],
    };
    expect(findCommunityAtPoint(2, 2, multi)).toBe('Multi');
    expect(findCommunityAtPoint(12, 12, multi)).toBe('Multi');
    expect(findCommunityAtPoint(7, 7, multi)).toBeNull();
  });

  it('tries multiple property name conventions', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { community: 'ByComm' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
          },
        },
      ],
    };
    expect(findCommunityAtPoint(5, 5, fc)).toBe('ByComm');
  });
});
