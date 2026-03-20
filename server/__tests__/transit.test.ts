import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCityAverage, type TransitScore } from '../services/transit.js';

function makeScore(transitScore: number): TransitScore {
  return {
    stopCount: 10,
    agencyCount: 2,
    agencies: ['MTS'],
    rawScore: 10,
    transitScore,
    travelTimeToCityHall: null,
  };
}

describe('getCityAverage', () => {
  it('returns 0 for empty map', () => {
    assert.equal(getCityAverage(new Map()), 0);
  });

  it('returns the score for a single entry', () => {
    const scores = new Map<string, TransitScore>([['A', makeScore(75)]]);
    assert.equal(getCityAverage(scores), 75);
  });

  it('computes rounded average for multiple entries', () => {
    const scores = new Map<string, TransitScore>([
      ['A', makeScore(70)],
      ['B', makeScore(80)],
      ['C', makeScore(90)],
    ]);
    assert.equal(getCityAverage(scores), 80);
  });

  it('rounds to nearest integer', () => {
    const scores = new Map<string, TransitScore>([
      ['A', makeScore(33)],
      ['B', makeScore(34)],
    ]);
    // (33+34)/2 = 33.5 → rounds to 34
    assert.equal(getCityAverage(scores), 34);
  });
});
