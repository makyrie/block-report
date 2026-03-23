import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateFlyerPdf } from '../services/pdf.js';
import { logger } from '../logger.js';

const router = Router();

const SUPPORTED_LANGUAGES = ['English', 'Spanish', 'Vietnamese', 'Tagalog', 'Chinese', 'Arabic'];
const MAX_ARRAY_ITEMS = 10;
const MAX_STRING_LEN = 2000;

/** Truncate string fields and cap array lengths to prevent abuse */
function capReport(report: Record<string, unknown>): Record<string, unknown> {
  const capped: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(report)) {
    if (typeof val === 'string') {
      capped[key] = val.slice(0, MAX_STRING_LEN);
    } else if (Array.isArray(val)) {
      capped[key] = val.slice(0, MAX_ARRAY_ITEMS).map((item) =>
        typeof item === 'string' ? item.slice(0, MAX_STRING_LEN) : item,
      );
    } else if (val && typeof val === 'object') {
      capped[key] = capReport(val as Record<string, unknown>);
    } else {
      capped[key] = val;
    }
  }
  return capped;
}

/**
 * POST /api/report/pdf
 *
 * Generate a PDF of the community brief flyer.
 * Expects JSON body with: report, neighborhoodSlug, metrics (optional), topLanguages (optional).
 * Returns application/pdf binary.
 */
router.post('/pdf', async (req: Request, res: Response) => {
  try {
    const { report, neighborhoodSlug, metrics, topLanguages } = req.body;

    // ── Validate required fields ──
    if (!report || typeof report !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "report" field' });
      return;
    }
    if (!neighborhoodSlug || typeof neighborhoodSlug !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "neighborhoodSlug" field' });
      return;
    }
    if (typeof report.neighborhoodName !== 'string' || typeof report.language !== 'string') {
      res.status(400).json({ error: 'report must contain neighborhoodName and language strings' });
      return;
    }
    if (!SUPPORTED_LANGUAGES.includes(report.language)) {
      res.status(400).json({ error: `Unsupported language. Must be one of: ${SUPPORTED_LANGUAGES.join(', ')}` });
      return;
    }

    // Cap array/string sizes to prevent memory abuse
    const cappedReport = capReport(report) as typeof report;

    // ── Sanitize: strip control characters from user-provided strings ──
    const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;
    const sanitizedSlug = neighborhoodSlug.replace(CONTROL_CHAR_RE, '').slice(0, 200);

    // Determine base URL for QR codes and links
    const baseUrl = process.env.APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      || 'https://blockreport.org';

    const pdfBuffer = await generateFlyerPdf({
      report: cappedReport,
      neighborhoodSlug: sanitizedSlug,
      metrics: metrics ?? null,
      topLanguages: (topLanguages ?? []).slice(0, MAX_ARRAY_ITEMS),
      baseUrl,
    });

    // Build filename: restrict to safe characters for Content-Disposition header
    const langCode = cappedReport.language?.toLowerCase().slice(0, 10) || 'en';
    const filename = `${sanitizedSlug}-${langCode}`.replace(/[^a-z0-9.-]/g, '-') + '.pdf';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'no-store',
    });
    res.send(pdfBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('PDF generation error', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (message.includes('timed out')) {
      res.status(504).json({ error: 'PDF generation timed out. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to generate PDF. Please try again.' });
    }
  }
});

export default router;
