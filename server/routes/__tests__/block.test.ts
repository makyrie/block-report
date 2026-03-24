import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock Prisma before importing the router
vi.mock('../../services/db.js', () => ({
  prisma: {
    request311: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import app from '../../app.js';
import { prisma } from '../../services/db.js';

// Helper to create a mock Express req/res pair for direct router testing
function mockReqRes(query: Record<string, string>) {
  const req = { query } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

describe('GET /api/block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when lat/lng are missing', async () => {
    // Use the router directly through the Express app stack
    const { default: request } = await import('supertest').catch(() => ({ default: null }));
    // Fallback: test validation logic directly with mock req/res
    // Import the router and manually invoke it
    const blockRouter = (await import('../block.js')).default;

    const { req, res } = mockReqRes({});
    // Get the route handler from the router
    const layer = (blockRouter as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    );
    await layer.route.stack[0].handle(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('lat and lng') }),
    );
  });

  it('returns 400 for coordinates outside San Diego', async () => {
    const blockRouter = (await import('../block.js')).default;
    const { req, res } = mockReqRes({ lat: '40.7', lng: '-74.0' }); // NYC
    const layer = (blockRouter as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    );
    await layer.route.stack[0].handle(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('outside') }),
    );
  });

  it('returns block metrics for valid San Diego coordinates', async () => {
    const mockData = [
      {
        service_request_id: 'SR-001',
        service_name: 'Pothole',
        service_name_detail: 'Street pothole',
        status: 'Closed',
        date_requested: new Date('2024-06-01'),
        date_closed: new Date('2024-06-05'),
        lat: 32.9,
        lng: -117.2,
        street_address: '123 Main St',
      },
      {
        service_request_id: 'SR-002',
        service_name: 'Graffiti',
        service_name_detail: null,
        status: 'Open',
        date_requested: new Date('2024-06-10'),
        date_closed: null,
        lat: 32.9001,
        lng: -117.2001,
        street_address: '456 Oak Ave',
      },
    ];

    (prisma.request311.findMany as any).mockResolvedValue(mockData);

    const blockRouter = (await import('../block.js')).default;
    const { req, res } = mockReqRes({ lat: '32.9', lng: '-117.2', radius: '0.25' });
    const layer = (blockRouter as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    );
    await layer.route.stack[0].handle(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalReports: expect.any(Number),
        openCount: expect.any(Number),
        resolvedCount: expect.any(Number),
        radiusMiles: 0.25,
        reports: expect.any(Array),
      }),
    );
  });

  it('snaps radius to nearest allowed value', async () => {
    (prisma.request311.findMany as any).mockResolvedValue([]);

    const blockRouter = (await import('../block.js')).default;
    const { req, res } = mockReqRes({ lat: '32.9', lng: '-117.2', radius: '0.3' });
    const layer = (blockRouter as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    );
    await layer.route.stack[0].handle(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ radiusMiles: 0.25 }),
    );
  });

  it('returns 500 when database query fails', async () => {
    (prisma.request311.findMany as any).mockRejectedValue(new Error('DB connection failed'));

    const blockRouter = (await import('../block.js')).default;
    const { req, res } = mockReqRes({ lat: '32.9', lng: '-117.2' });
    const layer = (blockRouter as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    );
    await layer.route.stack[0].handle(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' }),
    );
  });
});
