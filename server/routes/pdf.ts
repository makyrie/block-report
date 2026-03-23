import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateFlyerPdf } from '../services/pdf.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * POST /api/brief/pdf
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

    // ── Sanitize: strip control characters from user-provided strings ──
    const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;
    const sanitizedSlug = neighborhoodSlug.replace(CONTROL_CHAR_RE, '').slice(0, 200);

    // Determine base URL for QR codes and links
    const baseUrl = process.env.APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      || 'https://blockreport.org';

    const pdfBuffer = await generateFlyerPdf({
      report,
      neighborhoodSlug: sanitizedSlug,
      metrics: metrics ?? null,
      topLanguages: topLanguages ?? [],
      baseUrl,
    });

    // Build filename: {slug}-{lang-code}.pdf
    const langCode = report.language?.toLowerCase().slice(0, 10) || 'en';
    const filename = `${sanitizedSlug}-${langCode}.pdf`;

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
