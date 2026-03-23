import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateReport, generateBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile } from '../../types/index.js';
import { getCachedReport, saveCachedReport, getCachedBlockReport, saveCachedBlockReport, isGenerationRateLimited, GENERATION_RATE_WINDOW_MS } from '../services/report-cache.js';

const router = Router();

// In-memory lock to coalesce concurrent generation requests for the same community+language
const inFlightGenerations = new Map<string, Promise<import('../../types/index.js').CommunityReport>>();
const RETRY_AFTER_SECONDS = Math.ceil(GENERATION_RATE_WINDOW_MS / 1000);

const SUPPORTED_LANGUAGES = new Set(['en', 'es', 'vi', 'tl', 'zh', 'ar']);
const MAX_PROFILE_SIZE = 10_000;
const MAX_BLOCK_METRICS_SIZE = 5_000;

// GET /api/report?community={name}&language={lang} — cached community report
// GET /api/report?lat=X&lng=Y&radius=Z&language=L — cached block-level report (by anchor ID)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Block-level lookup by coordinates — delegate to strategy-based cache
    if (req.query.lat && req.query.lng) {
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
        res.status(404).json({ error: 'No cached block report found for this location' });
      }
      return;
    }

    // Community-level lookup by name
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
    if (typeof language !== 'string' || !language || !SUPPORTED_LANGUAGES.has(language)) {
      res.status(400).json({ error: `language must be one of: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}` });
      return;
    }
    if (JSON.stringify(profile).length > MAX_PROFILE_SIZE) {
      res.status(400).json({ error: `profile payload too large (max ${MAX_PROFILE_SIZE} bytes)` });
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
      res.set('Retry-After', String(RETRY_AFTER_SECONDS)).status(429).json({ error: 'Too many reports generated recently, please try again later' });
      return;
    }

    // Coalesce concurrent requests for the same community+language
    const generationKey = `community:${profile.communityName}:${language}`;
    let reportPromise = inFlightGenerations.get(generationKey);
    if (!reportPromise) {
      logger.info('No pre-generated report found, generating on-demand', {
        community: profile.communityName,
        language,
      });
      reportPromise = generateReport(profile, language).then(async (report) => {
        await saveCachedReport(profile.communityName, language, report);
        return report;
      });
      inFlightGenerations.set(generationKey, reportPromise);
      reportPromise.finally(() => inFlightGenerations.delete(generationKey));
    }

    const report = await reportPromise;
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
    if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.has(language)) {
      res.status(400).json({ error: `language must be one of: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}` });
      return;
    }
    if (JSON.stringify(blockMetrics).length > MAX_BLOCK_METRICS_SIZE) {
      res.status(400).json({ error: `blockMetrics payload too large (max ${MAX_BLOCK_METRICS_SIZE} bytes)` });
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
      res.set('Retry-After', String(RETRY_AFTER_SECONDS)).status(429).json({ error: 'Too many reports generated recently, please try again later' });
      return;
    }

    // Coalesce concurrent requests for the same anchor+language
    const blockGenKey = `block:${anchorCacheId}:${language}`;
    let blockPromise = inFlightGenerations.get(blockGenKey);
    if (!blockPromise) {
      logger.info('Generating block report on-demand', {
        anchor: anchor.name,
        language,
      });
      blockPromise = generateBlockReport(anchor, blockMetrics, language, demographics).then(async (report) => {
        await saveCachedBlockReport(anchorCacheId, language, report);
        return report;
      });
      inFlightGenerations.set(blockGenKey, blockPromise);
      blockPromise.finally(() => inFlightGenerations.delete(blockGenKey));
    }

    const report = await blockPromise;
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

export default router;
