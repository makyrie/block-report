import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../services/claude.js', () => ({
  generateReport: vi.fn(),
  generateBlockReport: vi.fn(),
}));

vi.mock('../services/report-cache.js', () => ({
  getCachedReport: vi.fn().mockResolvedValue(null),
  saveCachedReport: vi.fn().mockResolvedValue(undefined),
  getCachedBlockReport: vi.fn().mockResolvedValue(null),
  saveCachedBlockReport: vi.fn().mockResolvedValue(undefined),
  isGenerationRateLimited: vi.fn().mockResolvedValue(false),
  GENERATION_RATE_WINDOW_MS: 60000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { generateReport } from '../services/claude.js';
import { getCachedReport } from '../services/report-cache.js';

async function getRouteHandler(method: string, path: string) {
  const mod = await import('./report.js');
  const router = mod.default;
  type Layer = { route: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: Response) => Promise<void> }[] } };
  const layer = (router as unknown as { stack: Layer[] })
    .stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`${method} ${path} route not found`);
  return layer.route.stack[0].handle;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return { query: {}, body: {}, ...overrides } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    status(code: number) { res._status = code; return res; },
    json(data: unknown) { res._json = data; return res; },
    set(key: string, val: string) { res._headers[key] = val; return res; },
  };
  return res as unknown as Response & { _status: number; _json: unknown; _headers: Record<string, string> };
}

describe('GET /api/report', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await getRouteHandler('get', '/');
  });

  it('returns 400 if no community or lat/lng', async () => {
    const res = mockRes();
    await handler(mockReq({ query: {} }), res);
    expect(res._status).toBe(400);
  });

  it('returns 404 if no cached report', async () => {
    const res = mockRes();
    await handler(mockReq({ query: { community: 'Mira Mesa', language: 'en' } as Record<string, string> }), res);
    expect(res._status).toBe(404);
  });

  it('returns cached report if available', async () => {
    const cached = { neighborhoodName: 'Mira Mesa', generatedAt: '2024-01-01' };
    vi.mocked(getCachedReport).mockResolvedValueOnce(cached as never);
    const res = mockRes();
    await handler(mockReq({ query: { community: 'Mira Mesa', language: 'en' } as Record<string, string> }), res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual(cached);
  });
});

describe('POST /api/report/generate', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await getRouteHandler('post', '/generate');
  });

  it('returns 400 if profile is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { language: 'en' } }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 if language is invalid', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { profile: { communityName: 'Test' }, language: 'xx' } }), res);
    expect(res._status).toBe(400);
  });

  it('generates report on valid input', async () => {
    const report = { neighborhoodName: 'Mira Mesa', generatedAt: '2024-01-01' };
    vi.mocked(generateReport).mockResolvedValueOnce(report as never);
    const res = mockRes();
    await handler(mockReq({
      body: {
        profile: { communityName: 'Mira Mesa' },
        language: 'en',
      },
    }), res);
    expect(res._status).toBe(200);
    expect(res._json).toEqual(report);
  });
});
