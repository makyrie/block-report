import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processMetrics, type CommunityMetrics } from '../services/metrics.js';

function makeMetrics(overrides: Partial<CommunityMetrics> = {}): CommunityMetrics {
  return {
    total_requests: 100,
    resolved_count: 80,
    avg_days_to_resolve: 5.2,
    top_issues: [{ category: 'Pothole', count: 30 }],
    recently_resolved: [{ category: 'Pothole', date: '2026-01-01' }],
    recent_resolved_90d: 20,
    top_recent_category: 'Pothole',
    top_recent_category_count: 10,
    high_res_categories: [{ category: 'Pothole', total: 30, resolved: 28, resolution_rate: 93 }],
    population: 50000,
    ...overrides,
  };
}

describe('processMetrics', () => {
  it('computes resolution rate', () => {
    const result = processMetrics(makeMetrics());
    assert.equal(result.resolutionRate, 0.8);
  });

  it('handles zero total requests', () => {
    const result = processMetrics(makeMetrics({ total_requests: 0, resolved_count: 0 }));
    assert.equal(result.resolutionRate, 0);
  });

  it('computes requests per 1000 residents', () => {
    const result = processMetrics(makeMetrics({ total_requests: 100, population: 50000 }));
    assert.equal(result.requestsPer1000Residents, 2);
  });

  it('returns null requestsPer1000Residents when population is 0', () => {
    const result = processMetrics(makeMetrics({ population: 0 }));
    assert.equal(result.requestsPer1000Residents, null);
  });

  it('generates good news for high resolution rate', () => {
    const result = processMetrics(makeMetrics({ total_requests: 100, resolved_count: 80 }));
    assert.ok(result.goodNews.some((g) => g.includes('resolved') && g.includes('80%')));
  });

  it('generates good news for recent resolved issues', () => {
    const result = processMetrics(makeMetrics({ recent_resolved_90d: 15, top_recent_category: 'Graffiti', top_recent_category_count: 8 }));
    assert.ok(result.goodNews.some((g) => g.includes('15 issues') && g.includes('Graffiti')));
  });

  it('generates no good news when metrics are low', () => {
    const result = processMetrics(makeMetrics({
      total_requests: 100,
      resolved_count: 10,
      recent_resolved_90d: 0,
      top_recent_category: null,
      top_recent_category_count: 0,
      high_res_categories: [],
      population: 50000,
    }));
    assert.equal(result.goodNews.length, 0);
  });
});
