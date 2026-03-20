import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock the services before importing the router
vi.mock('../services/gap-analysis.js', () => ({
  getAccessGapScore: vi.fn(),
  getAccessGapScores: vi.fn(),
  getTopUnderserved: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../utils/community.js', async () => {
  const actual = await vi.importActual('../utils/community.js') as Record<string, unknown>;
  return actual;
});

import { getAccessGapScores, getTopUnderserved } from '../services/gap-analysis.js';

// Helper to extract the ranking route handler from the router
async function getRankingHandler() {
  // Re-import to get fresh router with mocked deps
  const mod = await import('./gap-analysis.js');
  const router = mod.default;
  // Express router stores layers; find the /ranking GET handler
  const layer = (router as unknown as { stack: { route: { path: string; methods: { get?: boolean } }; handle: unknown }[] })
    .stack.find((l) => l.route?.path === '/ranking' && l.route?.methods?.get);
  if (!layer) throw new Error('ranking route not found');
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(query: Record<string, string | undefined> = {}): Request {
  return { query } as unknown as Request;
}

const mockScores = new Map([
  ['COMMUNITY_A', { accessGapScore: 70, signals: { lowEngagement: 0.8, lowTransit: 0.5, highNonEnglish: 0.6 }, rank: 1, totalCommunities: 3 }],
  ['COMMUNITY_B', { accessGapScore: 55, signals: { lowEngagement: 0.4, lowTransit: 0.7, highNonEnglish: 0.5 }, rank: 2, totalCommunities: 3 }],
  ['COMMUNITY_C', { accessGapScore: 30, signals: { lowEngagement: 0.2, lowTransit: 0.3, highNonEnglish: 0.1 }, rank: 3, totalCommunities: 3 }],
]);

const mockRanking = [
  { community: 'COMMUNITY_A', accessGapScore: 70, signals: mockScores.get('COMMUNITY_A')!.signals, topFactors: ['factor.lowEngagement'], rank: 1, totalCommunities: 3 },
  { community: 'COMMUNITY_B', accessGapScore: 55, signals: mockScores.get('COMMUNITY_B')!.signals, topFactors: ['factor.lowTransit'], rank: 2, totalCommunities: 3 },
];

describe('/api/access-gap/ranking', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.mocked(getAccessGapScores).mockResolvedValue(mockScores);
    vi.mocked(getTopUnderserved).mockResolvedValue(mockRanking);
    handler = await getRankingHandler();
  });

  it('returns ranking with default limit of 10', async () => {
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(10);
    expect(res.json).toHaveBeenCalledWith({
      ranking: mockRanking,
      summary: { total: 3, withGaps: 2 },
    });
  });

  it('parses numeric limit', async () => {
    const req = mockReq({ limit: '5' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(5);
  });

  it('limit=0 returns MAX_RESULTS (200)', async () => {
    const req = mockReq({ limit: '0' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(200);
  });

  it('limit=all returns MAX_RESULTS (200)', async () => {
    const req = mockReq({ limit: 'all' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(200);
  });

  it('caps limit at MAX_RESULTS (200)', async () => {
    const req = mockReq({ limit: '999' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(200);
  });

  it('rounds fractional limit', async () => {
    const req = mockReq({ limit: '3.7' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(4);
  });

  it('falls back to default for negative limit', async () => {
    const req = mockReq({ limit: '-5' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(10);
  });

  it('falls back to default for NaN limit', async () => {
    const req = mockReq({ limit: 'abc' });
    const res = mockRes();
    await handler(req, res);

    expect(getTopUnderserved).toHaveBeenCalledWith(10);
  });

  it('counts communities with gaps (score >= 50)', async () => {
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);

    const response = vi.mocked(res.json).mock.calls[0][0] as { summary: { withGaps: number } };
    // COMMUNITY_A (70) and COMMUNITY_B (55) have score >= 50
    expect(response.summary.withGaps).toBe(2);
  });

  it('returns 500 on service error', async () => {
    vi.mocked(getAccessGapScores).mockRejectedValue(new Error('DB down'));
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
