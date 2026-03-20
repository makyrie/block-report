import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock prisma before importing block service
const mockFindMany = mock.fn(async () => []);

mock.module('../services/db.js', {
  namedExports: {
    prisma: {
      request311: {
        findMany: mockFindMany,
      },
    },
  },
});

const { getBlockMetrics } = await import('../services/block.js');

describe('getBlockMetrics', () => {
  it('returns zero counts for empty data', async () => {
    mockFindMany.mock.resetCalls();
    mockFindMany.mock.mockImplementation(async () => []);

    const result = await getBlockMetrics(32.9, -117.1, 0.25);
    assert.equal(result.totalRequests, 0);
    assert.equal(result.openCount, 0);
    assert.equal(result.resolvedCount, 0);
    assert.equal(result.resolutionRate, 0);
    assert.equal(result.avgDaysToResolve, null);
    assert.deepEqual(result.topIssues, []);
    assert.equal(result.truncated, false);
  });

  it('filters by haversine distance', async () => {
    mockFindMany.mock.resetCalls();
    mockFindMany.mock.mockImplementation(async () => [
      // Within radius (~0.05 miles from center)
      { service_name: 'Pothole', status: 'Open', date_requested: new Date(), date_closed: null, lat: 32.9001, lng: -117.1001 },
      // Outside radius (~10 miles away)
      { service_name: 'Graffiti', status: 'Open', date_requested: new Date(), date_closed: null, lat: 33.05, lng: -117.0 },
    ]);

    const result = await getBlockMetrics(32.9, -117.1, 0.25);
    assert.equal(result.totalRequests, 1);
    assert.equal(result.topIssues[0].category, 'Pothole');
  });

  it('computes resolution rate correctly', async () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    mockFindMany.mock.resetCalls();
    mockFindMany.mock.mockImplementation(async () => [
      { service_name: 'Pothole', status: 'Closed', date_requested: fiveDaysAgo, date_closed: now, lat: 32.9, lng: -117.1 },
      { service_name: 'Graffiti', status: 'Open', date_requested: now, date_closed: null, lat: 32.9, lng: -117.1 },
    ]);

    const result = await getBlockMetrics(32.9, -117.1, 0.25);
    assert.equal(result.totalRequests, 2);
    assert.equal(result.resolvedCount, 1);
    assert.equal(result.resolutionRate, 0.5);
    assert.equal(result.avgDaysToResolve, 5);
  });

  it('marks truncated when ROW_LIMIT is hit', async () => {
    mockFindMany.mock.resetCalls();
    const rows = Array.from({ length: 10000 }, () => ({
      service_name: 'Pothole', status: 'Open', date_requested: new Date(), date_closed: null, lat: 32.9, lng: -117.1,
    }));
    mockFindMany.mock.mockImplementation(async () => rows);

    const result = await getBlockMetrics(32.9, -117.1, 0.25);
    assert.equal(result.truncated, true);
  });
});
