import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCityAverage, getTransitScores, getTransitScoreValues } from './transit-scores';
import type { TransitScore } from './transit-scores';

// Mock Prisma
vi.mock('./db.js', () => ({
  prisma: {
    transitStop: {
      findMany: vi.fn().mockResolvedValue([
        { lat: 32.90, lng: -117.14, stop_agncy: 'MTS' },
        { lat: 32.91, lng: -117.13, stop_agncy: 'MTS' },
        { lat: 32.90, lng: -117.15, stop_agncy: 'NCTD' },
        { lat: 32.72, lng: -117.16, stop_agncy: 'MTS' }, // near City Hall
      ]),
    },
  },
}));

// Mock boundaries — two small communities
vi.mock('./boundaries.js', () => ({
  fetchBoundaries: vi.fn().mockResolvedValue({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { cpname: 'TEST NORTH' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-117.16, 32.89], [-117.12, 32.89],
            [-117.12, 32.92], [-117.16, 32.92],
            [-117.16, 32.89],
          ]],
        },
      },
      {
        type: 'Feature',
        properties: { cpname: 'TEST SOUTH' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-117.17, 32.71], [-117.15, 32.71],
            [-117.15, 32.73], [-117.17, 32.73],
            [-117.17, 32.71],
          ]],
        },
      },
    ],
  }),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('transit score computation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes scores for all communities in boundaries', async () => {
    const scores = await getTransitScores();
    expect(scores.size).toBe(2);
    expect(scores.has('TEST NORTH')).toBe(true);
    expect(scores.has('TEST SOUTH')).toBe(true);
  });

  it('community with more stops gets higher raw score', async () => {
    const scores = await getTransitScores();
    const north = scores.get('TEST NORTH')!;
    const south = scores.get('TEST SOUTH')!;
    // TEST NORTH has 3 stops (MTS + NCTD), TEST SOUTH has 1 (MTS)
    expect(north.stopCount).toBeGreaterThan(south.stopCount);
    expect(north.rawScore).toBeGreaterThan(south.rawScore);
  });

  it('normalizes scores to 0-100 range', async () => {
    const scores = await getTransitScores();
    for (const [, score] of scores) {
      expect(score.transitScore).toBeGreaterThanOrEqual(0);
      expect(score.transitScore).toBeLessThanOrEqual(100);
    }
    // Highest raw score should normalize to 100
    const north = scores.get('TEST NORTH')!;
    expect(north.transitScore).toBe(100);
  });

  it('counts distinct agencies', async () => {
    const scores = await getTransitScores();
    const north = scores.get('TEST NORTH')!;
    expect(north.agencyCount).toBe(2);
    expect(north.agencies).toContain('MTS');
    expect(north.agencies).toContain('NCTD');
  });

  it('getTransitScoreValues returns simplified map', async () => {
    const values = await getTransitScoreValues();
    expect(values.size).toBe(2);
    for (const [, val] of values) {
      expect(typeof val).toBe('number');
    }
  });

  it('getCityAverage computes mean of transit scores', async () => {
    const scores = await getTransitScores();
    const avg = getCityAverage(scores);
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThanOrEqual(100);
  });

  it('estimates travel time to city hall', async () => {
    const scores = await getTransitScores();
    for (const [, score] of scores) {
      if (score.stopCount > 0) {
        expect(score.travelTimeToCityHall).not.toBeNull();
        expect(score.travelTimeToCityHall).toBeGreaterThan(0);
      }
    }
  });
});
