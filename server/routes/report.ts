import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateReport, generateBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile } from '../../types/index.js';
import { getCachedReport, saveCachedReport, getCachedBlockReport, saveCachedBlockReport, isGenerationRateLimited, GENERATION_RATE_WINDOW_MS } from '../services/report-cache.js';

const router = Router();

// In-memory lock to coalesce concurrent generation requests within the same process.
// On serverless (Vercel), each invocation may have its own process — the DB-backed
// cache check (getCachedReport) is the primary deduplication; this Map is a best-effort
// optimization to avoid duplicate Claude API calls within a single warm instance.
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
        // Save to cache but don't let save failures propagate — the report is still valid
        await saveCachedReport(profile.communityName, language, report).catch((err) => {
          logger.error('Failed to cache report, continuing with generated result', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        return report;
      });
      inFlightGenerations.set(generationKey, reportPromise);
      // Always clean up the in-flight map, even if generation or cache save fails
      reportPromise.then(() => inFlightGenerations.delete(generationKey), () => inFlightGenerations.delete(generationKey));
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
    const ANCHOR_ID_RE = /^[a-zA-Z0-9_-]+$/;
    const VALID_ANCHOR_TYPES = new Set(['library', 'rec_center']);
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
    // Validate anchor.id format to prevent cache key collision/poisoning
    if (anchor.id && !ANCHOR_ID_RE.test(anchor.id)) {
      res.status(400).json({ error: 'anchor.id must contain only alphanumeric characters, hyphens, and underscores' });
      return;
    }
    // Validate anchor.type against allowed enum values
    if (anchor.type && !VALID_ANCHOR_TYPES.has(anchor.type)) {
      res.status(400).json({ error: `anchor.type must be one of: ${Array.from(VALID_ANCHOR_TYPES).join(', ')}` });
      return;
    }
    if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.has(language)) {
      res.status(400).json({ error: `language must be one of: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}` });
      return;
    }
    if (JSON.stringify(blockMetrics).length > MAX_BLOCK_METRICS_SIZE) {
      res.status(400).json({ error: `blockMetrics payload too large (max ${MAX_BLOCK_METRICS_SIZE} bytes)` });
      return;
    }
    // Validate demographics if provided
    if (demographics !== undefined && demographics !== null) {
      if (typeof demographics !== 'object' || !Array.isArray(demographics.topLanguages)) {
        res.status(400).json({ error: 'demographics must be an object with a topLanguages array' });
        return;
      }
      if (JSON.stringify(demographics).length > MAX_BLOCK_METRICS_SIZE) {
        res.status(400).json({ error: `demographics payload too large (max ${MAX_BLOCK_METRICS_SIZE} bytes)` });
        return;
      }
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
        await saveCachedBlockReport(anchorCacheId, language, report).catch((err) => {
          logger.error('Failed to cache block report, continuing with generated result', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        return report;
      });
      inFlightGenerations.set(blockGenKey, blockPromise);
      blockPromise.then(() => inFlightGenerations.delete(blockGenKey), () => inFlightGenerations.delete(blockGenKey));
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
