import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateFlyerPdf } from '../services/pdf.js';
import { sanitizeStringFields, CONTROL_CHAR_RE } from '../services/claude.js';
import { logger } from '../logger.js';

const router = Router();

const SUPPORTED_LANGUAGES = ['English', 'Spanish', 'Vietnamese', 'Tagalog', 'Chinese', 'Arabic'];
const MAX_ARRAY_ITEMS = 10;

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

    // Cap array/string sizes and strip control characters to prevent abuse
    const cappedReport = sanitizeStringFields(report, undefined, undefined, {
      maxStringLen: 2000,
      maxArrayItems: MAX_ARRAY_ITEMS,
    }) as typeof report;

    // ── Sanitize slug ──
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
