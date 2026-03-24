import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateReport, generateBlockReport } from '../services/claude.js';
import { generatePdf } from '../services/pdf/index.js';
import { logger } from '../logger.js';
import type { CommunityReport, NeighborhoodProfile } from '../../src/types/index.js';
import { getCachedReport, saveCachedReport, getCachedBlockReport, saveCachedBlockReport, isGenerationRateLimited, recordGenerationAttempt } from '../services/report-cache.js';
import { LANGUAGE_CODES } from '../../src/constants/languages.js';

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const router = Router();

/** Server-side language allowlist — prevents prompt injection via arbitrary language strings */
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'vi', 'tl', 'zh', 'ar']);

// GET /api/report?community={name}&language={lang} — cached community report
router.get('/', async (req: Request, res: Response) => {
  try {
    const community = req.query.community as string;
    const language = req.query.language as string || 'en';

    if (!community) {
      res.status(400).json({ error: 'Missing required query parameter: community' });
      return;
    }

    const cached = await getCachedReport(community, language);
    if (cached) {
      res.json(cached);
    } else {
      res.status(404).json({ error: 'No cached report available' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Report lookup error', { error: message, stack: error instanceof Error ? error.stack : undefined });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report/block?anchorId={id}&language={lang} — cached block-level report
router.get('/block', async (req: Request, res: Response) => {
  try {
    const anchorId = req.query.anchorId as string;
    const language = (req.query.language as string) || 'en';

    if (!anchorId) {
      res.status(400).json({ error: 'Missing required query parameter: anchorId' });
      return;
    }

    const cached = await getCachedBlockReport(anchorId, language);
    if (cached) {
      res.json(cached);
    } else {
      res.status(404).json({ error: 'No cached block report found' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Block report lookup error', { error: message, stack: error instanceof Error ? error.stack : undefined });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { profile, language } = req.body as {
      profile: NeighborhoodProfile;
      language: string;
    };

    if (typeof profile !== 'object' || profile === null || typeof profile.communityName !== 'string') {
      res.status(400).json({ error: 'profile must be an object with a communityName string' });
      return;
    }
    if (typeof language !== 'string' || !ALLOWED_LANGUAGES.has(language)) {
      res.status(400).json({ error: `language must be one of: ${Array.from(ALLOWED_LANGUAGES).join(', ')}` });
      return;
    }

    // Run cache lookup and rate limit check in parallel to save a DB round trip
    const [cached, rateLimited] = await Promise.all([
      getCachedReport(profile.communityName, language),
      isGenerationRateLimited(),
    ]);
    if (cached) {
      logger.info('Serving cached report', { community: profile.communityName, language });
      res.json(cached);
      return;
    }
    if (rateLimited) {
      res.status(429).json({ error: 'Too many reports generated recently, please try again later' });
      return;
    }

    // Record attempt before calling Claude — counts toward rate limit even if generation fails
    recordGenerationAttempt();

    // Fall back to on-demand generation
    logger.info('No pre-generated report found, generating on-demand', {
      community: profile.communityName,
      language,
    });
    const report = await generateReport(profile, language);

    // Cache the generated report for future instant access (saveCachedReport handles its own errors)
    await saveCachedReport(profile.communityName, language, report);

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Report generation error', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report/generate-block — Generate a block-level report for an anchor location
router.post('/generate-block', async (req: Request, res: Response) => {
  try {
    const { anchor: rawAnchor, blockMetrics, language, demographics } = req.body;

    if (!rawAnchor || !blockMetrics || !language) {
      res.status(400).json({ error: 'Missing required fields: anchor, blockMetrics, language' });
      return;
    }

    // Validate anchor fields to prevent prompt injection via user-controlled strings
    // Work on a copy to avoid mutating req.body
    const anchor = { ...rawAnchor };
    const MAX_FIELD_LEN = 200;
    const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;
    for (const field of ['id', 'name', 'address', 'community', 'type'] as const) {
      if (anchor[field] !== undefined) {
        if (typeof anchor[field] !== 'string') {
          res.status(400).json({ error: `anchor.${field} must be a string` });
          return;
        }
        if (anchor[field].length > MAX_FIELD_LEN) {
          res.status(400).json({ error: `anchor.${field} must be ${MAX_FIELD_LEN} characters or fewer` });
          return;
        }
        anchor[field] = anchor[field].replace(CONTROL_CHAR_RE, '');
      }
    }
    if (typeof language !== 'string' || !ALLOWED_LANGUAGES.has(language)) {
      res.status(400).json({ error: `language must be one of: ${Array.from(ALLOWED_LANGUAGES).join(', ')}` });
      return;
    }

    // Validate blockMetrics shape to prevent malformed input from reaching Claude
    if (typeof blockMetrics !== 'object' || blockMetrics === null) {
      res.status(400).json({ error: 'blockMetrics must be an object' });
      return;
    }
    if (typeof blockMetrics.totalRequests !== 'number' || typeof blockMetrics.openCount !== 'number') {
      res.status(400).json({ error: 'blockMetrics must contain numeric totalRequests and openCount fields' });
      return;
    }

    // Run cache lookup and rate limit check in parallel to save a DB round trip
    const anchorCacheId = anchor.id || anchor.name;
    const [cached, rateLimited] = await Promise.all([
      getCachedBlockReport(anchorCacheId, language),
      isGenerationRateLimited(),
    ]);
    if (cached) {
      logger.info('Serving cached block report', { anchor: anchor.name, language });
      res.json(cached);
      return;
    }
    if (rateLimited) {
      res.status(429).json({ error: 'Too many reports generated recently, please try again later' });
      return;
    }

    recordGenerationAttempt();

    logger.info('Generating block report on-demand', {
      anchor: anchor.name,
      language,
    });

    const report = await generateBlockReport(anchor, blockMetrics, language, demographics);

    // Cache the generated block report for future requests (saveCachedBlockReport handles its own errors)
    await saveCachedBlockReport(anchorCacheId, language, report);

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Block report generation error', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report/pdf — Generate a PDF of the community flyer
router.post('/pdf', async (req: Request, res: Response) => {
  try {
    const { report, metrics, topLanguages, neighborhoodSlug } = req.body as {
      report: CommunityReport;
      metrics?: NeighborhoodProfile['metrics'];
      topLanguages?: { language: string; percentage: number }[];
      neighborhoodSlug: string;
    };

    if (!report || !neighborhoodSlug) {
      res.status(400).json({ error: 'Missing required fields: report, neighborhoodSlug' });
      return;
    }

    // Validate report structure
    if (
      typeof report.neighborhoodName !== 'string' ||
      typeof report.summary !== 'string' ||
      typeof report.language !== 'string' ||
      typeof report.generatedAt !== 'string' ||
      !Array.isArray(report.goodNews) ||
      !report.goodNews.every((s: unknown) => typeof s === 'string') ||
      !Array.isArray(report.topIssues) ||
      !report.topIssues.every((s: unknown) => typeof s === 'string') ||
      !Array.isArray(report.howToParticipate) ||
      !report.howToParticipate.every((s: unknown) => typeof s === 'string') ||
      !report.contactInfo ||
      typeof report.contactInfo.councilDistrict !== 'string' ||
      typeof report.contactInfo.anchorLocation !== 'string'
    ) {
      res.status(400).json({ error: 'Invalid report structure' });
      return;
    }

    if (typeof neighborhoodSlug !== 'string' || !/^[a-z0-9-]+$/.test(neighborhoodSlug)) {
      res.status(400).json({ error: 'Invalid neighborhoodSlug format' });
      return;
    }

    // Field length limits — defense-in-depth against oversized HTML rendering
    const MAX_TEXT_LENGTH = 5000;
    const MAX_ARRAY_ITEMS = 10;
    if (
      report.summary.length > MAX_TEXT_LENGTH ||
      report.neighborhoodName.length > 200 ||
      report.goodNews.length > MAX_ARRAY_ITEMS ||
      report.topIssues.length > MAX_ARRAY_ITEMS ||
      report.howToParticipate.length > MAX_ARRAY_ITEMS ||
      report.goodNews.some((s: string) => s.length > MAX_TEXT_LENGTH) ||
      report.topIssues.some((s: string) => s.length > MAX_TEXT_LENGTH) ||
      report.howToParticipate.some((s: string) => s.length > MAX_TEXT_LENGTH)
    ) {
      res.status(400).json({ error: 'Report fields exceed maximum length' });
      return;
    }

    // Validate optional metrics structure
    if (metrics != null) {
      if (
        typeof metrics.totalRequests311 !== 'number' ||
        typeof metrics.resolutionRate !== 'number' ||
        typeof metrics.avgDaysToResolve !== 'number' ||
        !Array.isArray(metrics.topIssues) ||
        !metrics.topIssues.every((i: unknown) =>
          i && typeof i === 'object' && typeof (i as Record<string, unknown>).category === 'string' && (i as Record<string, unknown>).category !== '' && ((i as Record<string, unknown>).category as string).length <= 200 && typeof (i as Record<string, unknown>).count === 'number'
        ) ||
        metrics.topIssues.length > MAX_ARRAY_ITEMS ||
        !Array.isArray(metrics.goodNews) ||
        !metrics.goodNews.every((g: unknown) => typeof g === 'string') ||
        metrics.goodNews.length > MAX_ARRAY_ITEMS
      ) {
        res.status(400).json({ error: 'Invalid metrics structure' });
        return;
      }
    }

    // Validate optional topLanguages structure
    if (topLanguages != null) {
      if (
        !Array.isArray(topLanguages) ||
        !topLanguages.every((l: unknown) =>
          l && typeof l === 'object' && typeof (l as Record<string, unknown>).language === 'string' && typeof (l as Record<string, unknown>).percentage === 'number'
        )
      ) {
        res.status(400).json({ error: 'Invalid topLanguages structure' });
        return;
      }
    }

    if (!process.env.APP_URL) {
      res.status(500).json({ error: 'APP_URL environment variable is not configured' });
      return;
    }
    const baseUrl = process.env.APP_URL;
    const pdf = await generatePdf({ report, metrics, topLanguages, neighborhoodSlug, baseUrl });

    const langCode = LANGUAGE_CODES[report.language] || 'en';
    const filename = `block-report-${sanitizeFilename(report.neighborhoodName)}-${langCode}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('PDF generation error', { error: message, stack: error instanceof Error ? error.stack : undefined });
    if (message.includes('queue full') || message.includes('queue timeout')) {
      res.status(503).json({ error: 'Server busy — try again shortly' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
