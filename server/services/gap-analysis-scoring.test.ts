import { describe, it, expect, vi, beforeEach } from 'vitest';
import { minMax, arrayMin, arrayMax, describeTopFactors, getTopUnderserved, getAccessGapScores, getAccessGapScore } from './gap-analysis';

// Mock dependencies so computeAllScores can run with controlled data
vi.mock('./db.js', () => ({
  prisma: {
    censusLanguage: {
      findMany: vi.fn().mockResolvedValue([
        { community: 'ALPHA', total_pop_5plus: 10000, english_only: 7000 },
        { community: 'BETA', total_pop_5plus: 8000, english_only: 2000 },
        { community: 'GAMMA', total_pop_5plus: 5000, english_only: 4500 },
      ]),
    },
    request311: {
      groupBy: vi.fn().mockResolvedValue([
        { comm_plan_name: 'ALPHA', _count: { _all: 500 } },
        { comm_plan_name: 'BETA', _count: { _all: 50 } },
        { comm_plan_name: 'GAMMA', _count: { _all: 200 } },
      ]),
    },
  },
}));

vi.mock('./transit-scores.js', () => ({
  getTransitScoreValues: vi.fn().mockResolvedValue(
    new Map([
      ['ALPHA', 80],
      ['BETA', 20],
      ['GAMMA', 50],
    ])
  ),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../utils/community.js', async () => {
  const actual = await vi.importActual('../utils/community.js') as Record<string, unknown>;
  return actual;
});

describe('computeAllScores integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes scores for all communities with valid data', async () => {
    const scores = await getAccessGapScores();
    expect(scores.size).toBe(3);

    // All should have valid scores
    for (const [, result] of scores) {
      expect(result.accessGapScore).toBeGreaterThanOrEqual(0);
      expect(result.accessGapScore).toBeLessThanOrEqual(100);
      expect(result.rank).toBeGreaterThanOrEqual(1);
      expect(result.totalCommunities).toBe(3);
    }
  });

  it('ranks communities by score descending', async () => {
    const scores = await getAccessGapScores();
    const entries = Array.from(scores.entries()).sort(([, a], [, b]) => a.rank - b.rank);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i][1].accessGapScore).toBeLessThanOrEqual(entries[i - 1][1].accessGapScore);
    }
  });

  it('BETA has highest gap (low engagement, low transit, high non-English)', async () => {
    const scores = await getAccessGapScores();
    const beta = scores.get('BETA');
    expect(beta).toBeDefined();
    // BETA: low engagement (50/8000*1000=6.25 vs ALPHA=50), low transit (20), high non-English (75%)
    // Should rank high in access gap
    expect(beta!.rank).toBe(1);
  });

  it('getAccessGapScore looks up by uppercase key', async () => {
    const result = await getAccessGapScore('alpha');
    expect(result).not.toBeNull();
    expect(result!.accessGapScore).toBeGreaterThanOrEqual(0);
  });

  it('getAccessGapScore returns null for unknown community', async () => {
    const result = await getAccessGapScore('NONEXISTENT');
    expect(result).toBeNull();
  });

  it('getTopUnderserved returns limited results with topFactors', async () => {
    const top = await getTopUnderserved(2);
    expect(top.length).toBeLessThanOrEqual(2);
    for (const entry of top) {
      expect(entry.topFactors).toBeInstanceOf(Array);
      expect(entry.community).toBeTruthy();
    }
  });

  it('all signals are populated for communities with full data', async () => {
    const scores = await getAccessGapScores();
    for (const [, result] of scores) {
      expect(result.signals.lowEngagement).not.toBeNull();
      expect(result.signals.lowTransit).not.toBeNull();
      expect(result.signals.highNonEnglish).not.toBeNull();
    }
  });
});

describe('scoring helpers', () => {
  it('minMax normalizes correctly at boundaries', () => {
    expect(minMax(0, 0, 100)).toBe(0);
    expect(minMax(100, 0, 100)).toBe(1);
    expect(minMax(50, 0, 100)).toBe(0.5);
  });

  it('minMax clamps out-of-range values', () => {
    expect(minMax(-50, 0, 100)).toBe(0);
    expect(minMax(200, 0, 100)).toBe(1);
  });

  it('arrayMin and arrayMax handle typical arrays', () => {
    expect(arrayMin([10, 20, 5, 30])).toBe(5);
    expect(arrayMax([10, 20, 5, 30])).toBe(30);
  });

  it('describeTopFactors identifies signals above threshold', () => {
    expect(describeTopFactors({ lowEngagement: 0.8, lowTransit: 0.3, highNonEnglish: 0.6 }))
      .toEqual(['factor.lowEngagement', 'factor.highNonEnglish']);
  });
});
