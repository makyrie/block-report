import { describe, it, expect } from 'vitest';
import { getCityAverage } from './transit-scores';
import type { TransitScore } from './transit-scores';

function makeScore(transitScore: number): TransitScore {
  return {
    stopCount: 0,
    agencyCount: 0,
    agencies: [],
    rawScore: 0,
    transitScore,
    travelTimeToCityHall: null,
  };
}

describe('getCityAverage', () => {
  it('computes rounded average of transit scores', () => {
    const scores = new Map<string, TransitScore>([
      ['A', makeScore(60)],
      ['B', makeScore(80)],
      ['C', makeScore(40)],
    ]);
    expect(getCityAverage(scores)).toBe(60);
  });

  it('returns 0 for empty map', () => {
    expect(getCityAverage(new Map())).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const scores = new Map<string, TransitScore>([
      ['A', makeScore(33)],
      ['B', makeScore(33)],
      ['C', makeScore(34)],
    ]);
    // (33 + 33 + 34) / 3 = 33.333 → 33
    expect(getCityAverage(scores)).toBe(33);
  });
});
