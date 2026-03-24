import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateReport, generateBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile } from '../../src/types/index.js';
import { getCachedReport, saveCachedReport, getCachedBlockReport, saveCachedBlockReport, isGenerationRateLimited, recordGenerationAttempt } from '../services/report-cache.js';

const router = Router();

/** Server-side language allowlist — prevents prompt injection via arbitrary language strings */
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'vi', 'tl', 'zh', 'ar']);

function validateLanguage(language: unknown): string | null {
  if (typeof language !== 'string' || !language || !ALLOWED_LANGUAGES.has(language)) return null;
  return language;
}

const MAX_PROFILE_SIZE = 10_000;
const MAX_BLOCK_METRICS_SIZE = 5_000;
const RETRY_AFTER_SECONDS = 3600; // 1 hour

// Simple per-IP rate limiting for report generation — supplements DB-backed global limit.
// On serverless this resets per cold start, but still mitigates rapid-fire abuse from a single IP.
const PER_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PER_IP_MAX = 5; // max reports per IP per window
const ipGenerationCounts = new Map<string, { count: number; resetAt: number }>();

function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipGenerationCounts.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipGenerationCounts.set(ip, { count: 1, resetAt: now + PER_IP_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > PER_IP_MAX;
}

// GET /api/report?community={name}&language={lang} — cached community report
router.get('/', async (req: Request, res: Response) => {
  try {
    const community = req.query.community as string;
    const language = validateLanguage(req.query.language) || 'en';

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
    const { profile, language: rawLang } = req.body as {
      profile: NeighborhoodProfile;
      language: string;
    };

    if (typeof profile !== 'object' || profile === null || typeof profile.communityName !== 'string') {
      res.status(400).json({ error: 'profile must be an object with a communityName string' });
      return;
    }
    const language = validateLanguage(rawLang);
    if (!language) {
      res.status(400).json({ error: `language must be one of: ${Array.from(ALLOWED_LANGUAGES).join(', ')}` });
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
    // Per-IP rate limit — supplements global DB-backed limit
    const clientIp = req.ip || 'unknown';
    if (isIpRateLimited(clientIp)) {
      logger.warn('Per-IP rate limit exceeded for report generation', { ip: clientIp });
      res.set('Retry-After', String(RETRY_AFTER_SECONDS)).status(429).json({ error: 'Too many report requests from this address, please try again later' });
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
    const { anchor: rawAnchor, blockMetrics, language: rawLang, demographics } = req.body;

    if (!rawAnchor || !blockMetrics || !rawLang) {
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
    if (anchor.id && !ANCHOR_ID_RE.test(anchor.id)) {
      res.status(400).json({ error: 'anchor.id must contain only alphanumeric characters, hyphens, and underscores' });
      return;
    }
    if (anchor.type && !VALID_ANCHOR_TYPES.has(anchor.type)) {
      res.status(400).json({ error: `anchor.type must be one of: ${Array.from(VALID_ANCHOR_TYPES).join(', ')}` });
      return;
    }
    const language = validateLanguage(rawLang);
    if (!language) {
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
    if (JSON.stringify(blockMetrics).length > MAX_BLOCK_METRICS_SIZE) {
      res.status(400).json({ error: `blockMetrics payload too large (max ${MAX_BLOCK_METRICS_SIZE} bytes)` });
      return;
    }
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

    const anchorCacheId = anchor.id || anchor.name;
    if (!anchorCacheId) {
      res.status(400).json({ error: 'anchor must have a non-empty id or name' });
      return;
    }

    // Run cache lookup and rate limit check in parallel to save a DB round trip
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
    // Per-IP rate limit — supplements global DB-backed limit
    const clientIp = req.ip || 'unknown';
    if (isIpRateLimited(clientIp)) {
      logger.warn('Per-IP rate limit exceeded for block report generation', { ip: clientIp });
      res.set('Retry-After', String(RETRY_AFTER_SECONDS)).status(429).json({ error: 'Too many report requests from this address, please try again later' });
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

export default router;
