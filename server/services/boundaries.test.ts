import { describe, it, expect } from 'vitest';
import { validateBoundaryCollection } from './boundaries';

describe('validateBoundaryCollection', () => {
  it('accepts a valid FeatureCollection with Polygon features', () => {
    const data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { cpname: 'Test' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          },
        },
      ],
    };
    expect(validateBoundaryCollection(data)).toBe(true);
  });

  it('accepts a valid FeatureCollection with MultiPolygon features', () => {
    const data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { cpname: 'Test' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
          },
        },
      ],
    };
    expect(validateBoundaryCollection(data)).toBe(true);
  });

  it('rejects null', () => {
    expect(validateBoundaryCollection(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateBoundaryCollection('string')).toBe(false);
  });

  it('rejects object without features array', () => {
    expect(validateBoundaryCollection({ type: 'FeatureCollection' })).toBe(false);
  });

  it('rejects features with unsupported geometry type', () => {
    const data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    };
    expect(validateBoundaryCollection(data)).toBe(false);
  });

  it('rejects features without properties', () => {
    const data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    };
    expect(validateBoundaryCollection(data)).toBe(false);
  });

  it('accepts empty features array', () => {
    const data = { type: 'FeatureCollection', features: [] };
    expect(validateBoundaryCollection(data)).toBe(true);
  });
});
