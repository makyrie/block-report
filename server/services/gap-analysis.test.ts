import { describe, it, expect, beforeEach } from 'vitest';
import { describeTopFactors, cachedScores } from './gap-analysis';

describe('describeTopFactors', () => {
  beforeEach(() => { cachedScores.invalidate(); });
  it('returns factors with signal values above 0.5', () => {
    const signals = { lowEngagement: 0.8, lowTransit: 0.6, highNonEnglish: 0.9 };
    const factors = describeTopFactors(signals);
    expect(factors).toEqual([
      'factor.lowEngagement',
      'factor.lowTransit',
      'factor.highNonEnglish',
    ]);
  });

  it('omits factors with signal values at or below 0.5', () => {
    const signals = { lowEngagement: 0.5, lowTransit: 0.3, highNonEnglish: 0.1 };
    const factors = describeTopFactors(signals);
    expect(factors).toEqual([]);
  });

  it('omits null signals', () => {
    const signals = { lowEngagement: null, lowTransit: null, highNonEnglish: 0.9 };
    const factors = describeTopFactors(signals);
    expect(factors).toEqual(['factor.highNonEnglish']);
  });

  it('returns empty array when all signals are null', () => {
    const signals = { lowEngagement: null, lowTransit: null, highNonEnglish: null };
    expect(describeTopFactors(signals)).toEqual([]);
  });

  it('correctly handles boundary value 0.51', () => {
    const signals = { lowEngagement: 0.51, lowTransit: 0.49, highNonEnglish: null };
    const factors = describeTopFactors(signals);
    expect(factors).toEqual(['factor.lowEngagement']);
  });
});
