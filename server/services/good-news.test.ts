import { describe, it, expect } from 'vitest';
import { deriveGoodNews } from './good-news';

function makeMetrics(overrides: Partial<{
  recent_resolved_90d: number;
  top_recent_category: string | null;
  top_recent_category_count: number;
  high_res_categories: { category: string; resolution_rate: number }[];
}> = {}) {
  return {
    recent_resolved_90d: overrides.recent_resolved_90d ?? 0,
    top_recent_category: overrides.top_recent_category ?? null,
    top_recent_category_count: overrides.top_recent_category_count ?? 0,
    high_res_categories: overrides.high_res_categories ?? [],
  };
}

describe('deriveGoodNews', () => {
  it('returns empty array when no conditions met', () => {
    const result = deriveGoodNews(makeMetrics(), 0.3, 10);
    expect(result).toEqual([]);
  });

  it('includes recently resolved message', () => {
    const result = deriveGoodNews(
      makeMetrics({ recent_resolved_90d: 42, top_recent_category: 'Pothole', top_recent_category_count: 15 }),
      0.3, 10,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('42 issues');
    expect(result[0]).toContain('Pothole');
  });

  it('includes high resolution rate category', () => {
    const result = deriveGoodNews(
      makeMetrics({ high_res_categories: [{ category: 'Graffiti', resolution_rate: 95 }] }),
      0.3, 10,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Graffiti');
    expect(result[0]).toContain('95%');
  });

  it('includes overall resolution rate message at 70%', () => {
    const result = deriveGoodNews(makeMetrics(), 0.7, 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('70%');
  });

  it('does not include overall resolution rate below 70%', () => {
    const result = deriveGoodNews(makeMetrics(), 0.69, 10);
    expect(result).toEqual([]);
  });

  it('includes civic engagement message at 50 per 1000', () => {
    const result = deriveGoodNews(makeMetrics(), 0.3, 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('50');
  });

  it('handles null requestsPer1000Residents', () => {
    const result = deriveGoodNews(makeMetrics(), 0.3, null);
    expect(result).toEqual([]);
  });

  it('returns multiple good news items when multiple conditions met', () => {
    const result = deriveGoodNews(
      makeMetrics({
        recent_resolved_90d: 10,
        top_recent_category: 'Pothole',
        top_recent_category_count: 5,
        high_res_categories: [{ category: 'Graffiti', resolution_rate: 92 }],
      }),
      0.8,
      60,
    );
    expect(result).toHaveLength(4);
  });
});
