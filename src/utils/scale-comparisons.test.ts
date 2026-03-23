import { describe, it, expect } from 'vitest';
import { generateComparisons } from './scale-comparisons';
import type { BlockMetrics, NeighborhoodProfile } from '../types';

function makeBlock(overrides: Partial<BlockMetrics> = {}): BlockMetrics {
  return {
    totalRequests: 20,
    openCount: 5,
    resolvedCount: 15,
    resolutionRate: 0.75,
    avgDaysToResolve: 10,
    topIssues: [{ category: 'Potholes', count: 8 }],
    recentlyResolved: [],
    radiusMiles: 0.25,
    ...overrides,
  };
}

function makeNeighborhood(overrides: Partial<NeighborhoodProfile['metrics']> = {}): NeighborhoodProfile['metrics'] {
  return {
    totalRequests311: 500,
    resolvedCount: 350,
    resolutionRate: 0.7,
    avgDaysToResolve: 14,
    topIssues: [{ category: 'Graffiti', count: 100 }],
    recentlyResolved: [],
    population: 30000,
    requestsPer1000Residents: 16,
    goodNews: [],
    ...overrides,
  };
}

describe('generateComparisons', () => {
  it('returns empty array when neighborhood has no requests', () => {
    const result = generateComparisons(makeBlock(), makeNeighborhood({ totalRequests311: 0 }), 'Test');
    expect(result).toEqual([]);
  });

  it('returns insight when block has no reports', () => {
    const result = generateComparisons(makeBlock({ totalRequests: 0 }), makeNeighborhood(), 'Test');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('insight');
    expect(result[0].text).toContain('No reports found');
  });

  it('always includes open count comparison first', () => {
    const result = generateComparisons(makeBlock(), makeNeighborhood(), 'Test');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].text).toContain('open report');
  });

  it('returns at most 3 comparisons', () => {
    const result = generateComparisons(makeBlock(), makeNeighborhood(), 'Test');
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('skips ratio comparisons when fewer than 5 block reports', () => {
    const result = generateComparisons(makeBlock({ totalRequests: 3 }), makeNeighborhood(), 'Test');
    expect(result).toHaveLength(1); // only the open count comparison
  });

  it('flags good-news when block resolution rate is higher', () => {
    const result = generateComparisons(
      makeBlock({ resolutionRate: 0.95 }),
      makeNeighborhood({ resolutionRate: 0.5 }),
      'Test',
    );
    const goodNews = result.find((c) => c.type === 'good-news');
    expect(goodNews).toBeDefined();
    expect(goodNews!.text).toContain('higher');
  });

  it('flags concern when block resolution rate is lower', () => {
    const result = generateComparisons(
      makeBlock({ resolutionRate: 0.3 }),
      makeNeighborhood({ resolutionRate: 0.8 }),
      'Test',
    );
    const concern = result.find((c) => c.type === 'concern');
    expect(concern).toBeDefined();
    expect(concern!.text).toContain('lower');
  });

  it('notes matching top issue', () => {
    const result = generateComparisons(
      makeBlock({ topIssues: [{ category: 'Graffiti', count: 5 }] }),
      makeNeighborhood({ topIssues: [{ category: 'Graffiti', count: 100 }] }),
      'Test',
    );
    const match = result.find((c) => c.text.includes('both near you'));
    expect(match).toBeDefined();
  });
});
