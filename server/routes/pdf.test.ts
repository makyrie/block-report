import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock dependencies before importing the router
vi.mock('../services/pdf.js', () => ({
  generateFlyerPdf: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { generateFlyerPdf } from '../services/pdf.js';

// Helper to extract the POST /pdf handler from the router
async function getPdfHandler() {
  const mod = await import('./pdf.js');
  const router = mod.default;
  const layer = (router as unknown as { stack: { route: { path: string; methods: { post?: boolean } }; handle: unknown; route: { stack: { handle: unknown }[] } }[] })
    .stack.find((l) => l.route?.path === '/pdf' && l.route?.methods?.post);
  if (!layer) throw new Error('pdf route not found');
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(body: unknown = {}): Request {
  return { body } as unknown as Request;
}

const validReport = {
  neighborhoodName: 'Mira Mesa',
  language: 'English',
  summary: 'Welcome to Mira Mesa.',
  goodNews: ['Park improvements'],
  topIssues: ['Potholes'],
  howToParticipate: ['Call 311'],
  contactInfo: {
    councilDistrict: 'District 6',
    phone311: '311',
    anchorLocation: 'Mira Mesa Library',
  },
  generatedAt: '2026-01-01T00:00:00Z',
};

describe('POST /api/report/pdf', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(generateFlyerPdf).mockResolvedValue(Buffer.from('fake-pdf'));
    handler = await getPdfHandler();
  });

  // ── Validation tests ──

  it('rejects missing report with 400', async () => {
    const res = mockRes();
    await handler(mockReq({ neighborhoodSlug: 'mira-mesa' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('report') }));
  });

  it('rejects missing neighborhoodSlug with 400', async () => {
    const res = mockRes();
    await handler(mockReq({ report: validReport }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('neighborhoodSlug') }));
  });

  it('rejects report without neighborhoodName', async () => {
    const res = mockRes();
    await handler(mockReq({ report: { language: 'English' }, neighborhoodSlug: 'test' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects unsupported language with 400', async () => {
    const res = mockRes();
    const report = { ...validReport, language: 'Klingon' };
    await handler(mockReq({ report, neighborhoodSlug: 'test' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Unsupported language') }));
  });

  it('accepts all 6 supported languages', async () => {
    for (const lang of ['English', 'Spanish', 'Vietnamese', 'Tagalog', 'Chinese', 'Arabic']) {
      vi.clearAllMocks();
      vi.mocked(generateFlyerPdf).mockResolvedValue(Buffer.from('pdf'));
      const res = mockRes();
      const report = { ...validReport, language: lang };
      await handler(mockReq({ report, neighborhoodSlug: 'test' }), res);
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalled();
    }
  });

  // ── Success path ──

  it('returns PDF with correct headers on success', async () => {
    const pdfBuf = Buffer.from('test-pdf-content');
    vi.mocked(generateFlyerPdf).mockResolvedValue(pdfBuf);
    const res = mockRes();
    await handler(mockReq({ report: validReport, neighborhoodSlug: 'mira-mesa' }), res);

    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
    }));
    expect(res.send).toHaveBeenCalledWith(pdfBuf);
  });

  // ── Content-Disposition sanitization ──

  it('produces safe filename with only [a-z0-9.-] characters', async () => {
    vi.mocked(generateFlyerPdf).mockResolvedValue(Buffer.from('pdf'));
    const res = mockRes();
    const report = { ...validReport, language: 'Spanish' };
    await handler(mockReq({ report, neighborhoodSlug: 'Mira "Mesa\\' }), res);

    const setCall = vi.mocked(res.set).mock.calls[0][0] as Record<string, string>;
    const disposition = setCall['Content-Disposition'];
    // Extract filename from header
    const match = disposition.match(/filename="([^"]+)"/);
    expect(match).toBeTruthy();
    const filename = match![1];
    // Only safe chars + .pdf extension
    expect(filename).toMatch(/^[a-z0-9.-]+\.pdf$/);
  });

  // ── Error handling ──

  it('returns 504 on timeout error', async () => {
    vi.mocked(generateFlyerPdf).mockRejectedValue(new Error('PDF generation timed out'));
    const res = mockRes();
    await handler(mockReq({ report: validReport, neighborhoodSlug: 'test' }), res);
    expect(res.status).toHaveBeenCalledWith(504);
  });

  it('returns 500 on other errors', async () => {
    vi.mocked(generateFlyerPdf).mockRejectedValue(new Error('Chromium crashed'));
    const res = mockRes();
    await handler(mockReq({ report: validReport, neighborhoodSlug: 'test' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
