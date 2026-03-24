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

// Per-IP rate limiting for report generation endpoints
// WARNING: This in-memory map resets on every serverless cold start (same limitation
// as the global express-rate-limit in app.ts). It provides best-effort protection
// in long-running processes but is not durable across Vercel function invocations.
const PER_IP_LIMIT = 5;
const PER_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_IP_ENTRIES = 1000; // Cap map size to prevent unbounded memory growth
const ipGenerationCounts = new Map<string, { count: number; resetAt: number }>();

function isIpRateLimited(ip: string): boolean {
  const now = Date.now();

  // Periodic cleanup: if map is too large, purge all expired entries
  if (ipGenerationCounts.size >= MAX_IP_ENTRIES) {
    for (const [key, val] of ipGenerationCounts) {
      if (now >= val.resetAt) ipGenerationCounts.delete(key);
    }
    // If still too large after cleanup, drop oldest entries
    if (ipGenerationCounts.size >= MAX_IP_ENTRIES) {
      const toDelete = ipGenerationCounts.size - MAX_IP_ENTRIES + 100;
      let deleted = 0;
      for (const key of ipGenerationCounts.keys()) {
        if (deleted >= toDelete) break;
        ipGenerationCounts.delete(key);
        deleted++;
      }
    }
  }

  const entry = ipGenerationCounts.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (entry) ipGenerationCounts.delete(ip);
    ipGenerationCounts.set(ip, { count: 1, resetAt: now + PER_IP_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > PER_IP_LIMIT;
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

    // Strip unexpected keys to prevent prompt bloat via arbitrary fields
    const ALLOWED_PROFILE_KEYS = new Set(['communityName', 'anchor', 'metrics', 'transit', 'demographics', 'accessGap']);
    for (const key of Object.keys(profile)) {
      if (!ALLOWED_PROFILE_KEYS.has(key)) {
        delete (profile as Record<string, unknown>)[key];
      }
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

    const clientIp = req.ip ?? 'unknown';

    // Run cache lookup and rate limit checks in parallel
    const [cached, globalRateLimited] = await Promise.all([
      getCachedReport(profile.communityName, language),
      isGenerationRateLimited(),
    ]);
    if (cached) {
      logger.info('Serving cached report', { community: profile.communityName, language });
      res.json(cached);
      return;
    }
    if (globalRateLimited || isIpRateLimited(clientIp)) {
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

    // Abort the Claude API call if the client disconnects
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    req.on('close', onClose);

    let report;
    try {
      report = await generateReport(profile, language, abortController.signal);
    } finally {
      req.removeListener('close', onClose);
    }

    // Fire-and-forget: always return the report even if caching fails
    saveCachedReport(profile.communityName, language, report).catch((err) => {
      logger.error('Failed to cache report (fire-and-forget)', { error: err instanceof Error ? err.message : String(err) });
    });

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
    // Work on a copy with only allowed keys to prevent prototype pollution and prompt bloat
    const ALLOWED_ANCHOR_KEYS = new Set(['id', 'name', 'type', 'lat', 'lng', 'address', 'phone', 'website', 'community']);
    const anchor: Record<string, unknown> = {};
    for (const key of Object.keys(rawAnchor)) {
      if (ALLOWED_ANCHOR_KEYS.has(key)) {
        anchor[key] = rawAnchor[key];
      }
    }
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

    // Validate blockMetrics structure — strip unexpected keys to prevent prompt bloat
    const ALLOWED_METRICS_KEYS = new Set(['totalRequests', 'openCount', 'resolvedCount', 'resolutionRate', 'avgDaysToResolve', 'topIssues', 'recentlyResolved', 'radiusMiles']);
    for (const key of Object.keys(blockMetrics)) {
      if (!ALLOWED_METRICS_KEYS.has(key)) {
        delete blockMetrics[key];
      }
    }
    if (typeof blockMetrics.totalRequests !== 'number' || typeof blockMetrics.openCount !== 'number') {
      res.status(400).json({ error: 'blockMetrics must contain numeric totalRequests and openCount fields' });
      return;
    }
    for (const field of ['totalRequests', 'openCount', 'resolvedCount', 'resolutionRate', 'radiusMiles'] as const) {
      if (typeof blockMetrics[field] !== 'number' || !isFinite(blockMetrics[field])) {
        res.status(400).json({ error: `blockMetrics.${field} must be a finite number` });
        return;
      }
    }
    if (!Array.isArray(blockMetrics.topIssues) || !Array.isArray(blockMetrics.recentlyResolved)) {
      res.status(400).json({ error: 'blockMetrics.topIssues and recentlyResolved must be arrays' });
      return;
    }
    // Validate and sanitize array element contents to prevent prompt injection
    const MAX_ARRAY_LEN = 20;
    const MAX_STR_LEN = 200;
    const CTRL_RE = /[\x00-\x1f\x7f]/g;
    blockMetrics.topIssues = blockMetrics.topIssues.slice(0, MAX_ARRAY_LEN).map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return { category: 'Unknown', count: 0 };
      const it = item as Record<string, unknown>;
      return {
        category: typeof it.category === 'string' ? it.category.slice(0, MAX_STR_LEN).replace(CTRL_RE, '') : 'Unknown',
        count: typeof it.count === 'number' && isFinite(it.count) ? it.count : 0,
      };
    });
    blockMetrics.recentlyResolved = blockMetrics.recentlyResolved.slice(0, MAX_ARRAY_LEN).map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return { category: 'Unknown', date: '' };
      const it = item as Record<string, unknown>;
      return {
        category: typeof it.category === 'string' ? it.category.slice(0, MAX_STR_LEN).replace(CTRL_RE, '') : 'Unknown',
        date: typeof it.date === 'string' ? it.date.slice(0, 30).replace(CTRL_RE, '') : '',
      };
    });
    if (JSON.stringify(blockMetrics).length > MAX_BLOCK_METRICS_SIZE) {
      res.status(400).json({ error: `blockMetrics payload too large (max ${MAX_BLOCK_METRICS_SIZE} bytes)` });
      return;
    }

    // Validate demographics if provided
    if (demographics !== undefined && demographics !== null) {
      if (typeof demographics !== 'object') {
        res.status(400).json({ error: 'demographics must be an object or null' });
        return;
      }
      if (demographics.topLanguages !== undefined && !Array.isArray(demographics.topLanguages)) {
        res.status(400).json({ error: 'demographics.topLanguages must be an array' });
        return;
      }
    }

    const clientIp = req.ip ?? 'unknown';

    // Derive cache key — both fields are optional, so guard against undefined
    const anchorCacheId = anchor.id || anchor.name;
    if (!anchorCacheId) {
      res.status(400).json({ error: 'anchor.id or anchor.name is required' });
      return;
    }

    // Run cache lookup and rate limit checks in parallel
    const [cached, globalRateLimited] = await Promise.all([
      getCachedBlockReport(anchorCacheId, language),
      isGenerationRateLimited(),
    ]);
    if (cached) {
      logger.info('Serving cached block report', { anchor: anchor.name, language });
      res.json(cached);
      return;
    }
    if (globalRateLimited || isIpRateLimited(clientIp)) {
      res.status(429).json({ error: 'Too many reports generated recently, please try again later' });
      return;
    }

    recordGenerationAttempt();

    logger.info('Generating block report on-demand', {
      anchor: anchor.name,
      language,
    });

    // Abort the Claude API call if the client disconnects
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    req.on('close', onClose);

    let report;
    try {
      report = await generateBlockReport(anchor, blockMetrics, language, demographics, abortController.signal);
    } finally {
      req.removeListener('close', onClose);
    }

    // Fire-and-forget: always return the report even if caching fails
    saveCachedBlockReport(anchorCacheId, language, report).catch((err) => {
      logger.error('Failed to cache block report (fire-and-forget)', { error: err instanceof Error ? err.message : String(err) });
    });

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
