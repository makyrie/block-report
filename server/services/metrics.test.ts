import { describe, it, expect } from 'vitest';
import { buildCommunityMetricsResponse } from './metrics';

function makeRawMetrics(overrides: Partial<{
  total_requests: number;
  resolved_count: number;
  avg_days_to_resolve: number;
  population: number;
}> = {}) {
  return {
    total_requests: overrides.total_requests ?? 100,
    resolved_count: overrides.resolved_count ?? 75,
    avg_days_to_resolve: overrides.avg_days_to_resolve ?? 5.2,
    top_issues: [{ category: 'Pothole', count: 30 }],
    recently_resolved: [{ category: 'Pothole', date: '2025-01-15' }],
    recent_resolved_90d: 20,
    top_recent_category: 'Pothole',
    top_recent_category_count: 10,
    high_res_categories: [],
    population: overrides.population ?? 10000,
  };
}

describe('buildCommunityMetricsResponse', () => {
  it('computes resolution rate from totals', () => {
    const result = buildCommunityMetricsResponse(makeRawMetrics({ total_requests: 200, resolved_count: 150 }));
    expect(result.resolutionRate).toBe(0.75);
  });

  it('handles zero total requests gracefully', () => {
    const result = buildCommunityMetricsResponse(makeRawMetrics({ total_requests: 0, resolved_count: 0 }));
    expect(result.resolutionRate).toBe(0);
  });

  it('computes requestsPer1000Residents', () => {
    const result = buildCommunityMetricsResponse(makeRawMetrics({ total_requests: 500, population: 10000 }));
    expect(result.requestsPer1000Residents).toBe(50);
  });

  it('returns null requestsPer1000Residents when population is 0', () => {
    const result = buildCommunityMetricsResponse(makeRawMetrics({ population: 0 }));
    expect(result.requestsPer1000Residents).toBeNull();
  });

  it('passes through topIssues and recentlyResolved', () => {
    const result = buildCommunityMetricsResponse(makeRawMetrics());
    expect(result.topIssues).toEqual([{ category: 'Pothole', count: 30 }]);
    expect(result.recentlyResolved).toEqual([{ category: 'Pothole', date: '2025-01-15' }]);
  });

  it('includes goodNews array', () => {
    const result = buildCommunityMetricsResponse(makeRawMetrics());
    expect(Array.isArray(result.goodNews)).toBe(true);
  });
});
