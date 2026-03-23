import { describe, it, expect } from 'vitest';
import { computeBlockMetrics } from './block';

function makeRequest(overrides: Partial<{
  service_name: string | null;
  status: string | null;
  date_requested: Date | null;
  date_closed: Date | null;
  lat: number;
  lng: number;
}> = {}) {
  return {
    service_name: overrides.service_name ?? 'Pothole',
    status: overrides.status ?? 'Open',
    date_requested: overrides.date_requested ?? new Date('2025-01-01'),
    date_closed: overrides.date_closed ?? null,
    lat: overrides.lat ?? 32.9,
    lng: overrides.lng ?? -117.2,
  };
}

describe('computeBlockMetrics', () => {
  const lat = 32.9;
  const lng = -117.2;
  const radius = 0.5;

  it('returns zero counts for empty data', () => {
    const result = computeBlockMetrics([], lat, lng, radius);
    expect(result.totalRequests).toBe(0);
    expect(result.openCount).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(result.resolutionRate).toBe(0);
    expect(result.avgDaysToResolve).toBeNull();
    expect(result.topIssues).toEqual([]);
    expect(result.recentlyResolved).toEqual([]);
    expect(result.radiusMiles).toBe(radius);
  });

  it('counts open and resolved requests', () => {
    const data = [
      makeRequest({ status: 'Open' }),
      makeRequest({ status: 'Closed', date_closed: new Date('2025-01-15') }),
      makeRequest({ status: 'Open' }),
    ];
    const result = computeBlockMetrics(data, lat, lng, radius);
    expect(result.totalRequests).toBe(3);
    expect(result.openCount).toBe(2);
    expect(result.resolvedCount).toBe(1);
  });

  it('computes resolution rate', () => {
    const data = [
      makeRequest({ status: 'Closed', date_closed: new Date('2025-01-15') }),
      makeRequest({ status: 'Closed', date_closed: new Date('2025-01-20') }),
      makeRequest({ status: 'Open' }),
      makeRequest({ status: 'Open' }),
    ];
    const result = computeBlockMetrics(data, lat, lng, radius);
    expect(result.resolutionRate).toBe(0.5);
  });

  it('computes average days to resolve', () => {
    const data = [
      makeRequest({
        status: 'Closed',
        date_requested: new Date('2025-01-01'),
        date_closed: new Date('2025-01-11'), // 10 days
      }),
      makeRequest({
        status: 'Closed',
        date_requested: new Date('2025-01-01'),
        date_closed: new Date('2025-01-21'), // 20 days
      }),
    ];
    const result = computeBlockMetrics(data, lat, lng, radius);
    expect(result.avgDaysToResolve).toBe(15);
  });

  it('returns top issues sorted by count', () => {
    const data = [
      makeRequest({ service_name: 'Pothole' }),
      makeRequest({ service_name: 'Pothole' }),
      makeRequest({ service_name: 'Graffiti' }),
      makeRequest({ service_name: 'Pothole' }),
      makeRequest({ service_name: 'Graffiti' }),
      makeRequest({ service_name: 'Streetlight' }),
    ];
    const result = computeBlockMetrics(data, lat, lng, radius);
    expect(result.topIssues[0]).toEqual({ category: 'Pothole', count: 3 });
    expect(result.topIssues[1]).toEqual({ category: 'Graffiti', count: 2 });
  });

  it('filters out requests outside radius using Haversine', () => {
    const data = [
      makeRequest({ lat: 32.9, lng: -117.2 }),  // at center
      makeRequest({ lat: 33.5, lng: -117.2 }),  // far away
    ];
    const result = computeBlockMetrics(data, lat, lng, radius);
    expect(result.totalRequests).toBe(1);
  });
});
