import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateReport, generateBlockReport, generateAddressBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { CommunityReport, NeighborhoodProfile, StoredBlockReport } from '../../src/types/index.js';
import { getCachedReport, saveCachedReport, CACHE_TTL_MS, buildBlockCacheKey, getCachedReportByKey, saveCachedReportByKey, getCachedBlockReport, saveCachedBlockReport, isGenerationRateLimited, recordGenerationAttempt } from '../services/report-cache.js';
import { VALID_LANGUAGES, getLangCode, sanitizeFilename } from '../utils/language.js';
import { SD_BOUNDS } from '../utils/geo.js';
import { fetchBlockData } from '../services/block-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'cache', 'reports');
const BLOCK_REPORTS_DIR = path.join(REPORTS_DIR, 'blocks');

/** Server-side language allowlist — prevents prompt injection via arbitrary language strings */
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'vi', 'tl', 'zh', 'ar']);

function validateLanguage(language: string, res: Response): boolean {
  if (!VALID_LANGUAGES.has(language)) {
    res.status(400).json({ error: `Invalid language. Supported: ${[...VALID_LANGUAGES].join(', ')}` });
    return false;
  }
  return true;
}

interface StoredReport {
  communityName: string;
  language: string;
  languageCode: string;
  generatedAt: string;
  dataAsOf: string;
  report: CommunityReport;
}

async function getPreGeneratedReport(
  communityName: string,
  language: string,
): Promise<StoredReport | null> {
  const langCode = getLangCode(language);
  const filename = `${sanitizeFilename(communityName)}_${langCode}.json`;
  const filePath = path.join(REPORTS_DIR, filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stored = JSON.parse(content) as StoredReport;
    // Enforce TTL — ignore stale pre-generated reports
    if (stored.generatedAt) {
      const age = Date.now() - new Date(stored.generatedAt).getTime();
      if (age > CACHE_TTL_MS) return null;
    }
    return stored;
  } catch {
    return null;
  }
}

// In-flight request coalescing for Claude API calls (bounded to prevent memory leaks)
const MAX_IN_FLIGHT = 50;
const inFlightGenerations = new Map<string, Promise<CommunityReport>>();

/** Coalesce duplicate in-flight generation requests, generate, and cache the result. */
async function coalesceAndGenerate(
  coalescingKey: string,
  generateFn: () => Promise<CommunityReport>,
  cacheFn: (report: CommunityReport) => Promise<void>,
): Promise<CommunityReport> {
  let reportPromise = inFlightGenerations.get(coalescingKey);
  if (!reportPromise) {
    if (inFlightGenerations.size >= MAX_IN_FLIGHT) {
      throw new Error('Too many concurrent report generations. Please try again later.');
    }
    reportPromise = generateFn();
    inFlightGenerations.set(coalescingKey, reportPromise);
    reportPromise.finally(() => inFlightGenerations.delete(coalescingKey));
  } else {
    logger.info('Coalescing duplicate report request', { coalescingKey });
  }

  const report = await reportPromise;

  try {
    await cacheFn(report);
  } catch (err) {
    logger.error('Failed to cache report', { error: err instanceof Error ? err.message : String(err) });
  }

  return report;
}

const router = Router();

// GET /api/report/community?community={name}&language={lang} — pre-generated community report
router.get('/community', async (req: Request, res: Response) => {
  try {
    const community = String(req.query.community || '');
    const language = String(req.query.language || 'English');

    if (language !== 'English' && !validateLanguage(language, res)) return;

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
    logger.error('Community report lookup error', { error: message, stack: error instanceof Error ? error.stack : undefined });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report/block?lat=X&lng=Y&radius=Z&language=L — pre-generated block-level report
router.get('/block', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));
    const radius = parseFloat(String(req.query.radius)) || 0.25;
    const language = String(req.query.language || 'English');
    const anchorId = req.query.anchorId as string | undefined;

    if (!validateLanguage(language, res)) return;

    // Support both anchor-based and coordinate-based lookups
    if (anchorId) {
      const cached = await getCachedBlockReport(anchorId, language);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    if (isNaN(lat) || isNaN(lng)) {
      if (!anchorId) {
        res.status(400).json({ error: 'lat and lng must be valid numbers, or anchorId must be provided' });
        return;
      }
      res.status(404).json({ error: 'No cached block report found' });
      return;
    }

    // Try deterministic cache key for address block reports first (O(1) lookup)
    const langCode = getLangCode(language);
    const cacheKey = buildBlockCacheKey(lat, lng, radius, langCode);
    const cached = await getCachedReportByKey(cacheKey);
    if (cached) {
      logger.info('Serving cached address block report', { lat, lng, radius, language });
      res.json({ ...cached, preGenerated: true });
      return;
    }

    // Fall back to pre-generated anchor-based block reports by filename
    const filename = path.join(BLOCK_REPORTS_DIR, `block_${lat.toFixed(4)}_${lng.toFixed(4)}_${langCode}.json`);
    try {
      const content = await fs.readFile(filename, 'utf-8');
      const stored = JSON.parse(content) as StoredBlockReport;
      if (stored.radiusMiles === radius) {
        logger.info('Serving pre-generated block report', {
          anchor: stored.anchorName,
          language,
        });
        res.json({
          ...stored.report,
          preGenerated: true,
          anchorName: stored.anchorName,
          anchorType: stored.anchorType,
        });
        return;
      }
    } catch {
      // No pre-generated report at this location
    }

    res.status(404).json({ error: 'No pre-generated block report found for this location' });
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
    if (!validateLanguage(language, res)) return;

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

    // Fall back to on-demand generation with request coalescing
    const coalescingKey = `community_${sanitizeFilename(profile.communityName)}_${getLangCode(language)}`;
    const report = await coalesceAndGenerate(
      coalescingKey,
      () => generateReport(profile, language),
      (r) => saveCachedReport(profile.communityName, language, r),
    );

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

// POST /api/report/generate-block — Generate an anchor-based block report
router.post('/generate-block', async (req: Request, res: Response) => {
  try {
    const { anchor: rawAnchor, blockMetrics, language, demographics } = req.body;

    if (!rawAnchor || !blockMetrics || !language) {
      res.status(400).json({ error: 'Missing required fields: anchor, blockMetrics, language' });
      return;
    }
    if (!validateLanguage(language, res)) return;

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

    // Validate anchor lat/lng
    const anchorLat = Number(anchor.lat);
    const anchorLng = Number(anchor.lng);
    if (isNaN(anchorLat) || isNaN(anchorLng)) {
      res.status(400).json({ error: 'anchor.lat and anchor.lng must be valid numbers' });
      return;
    }
    if (anchorLat < SD_BOUNDS.latMin || anchorLat > SD_BOUNDS.latMax || anchorLng < SD_BOUNDS.lngMin || anchorLng > SD_BOUNDS.lngMax) {
      res.status(400).json({ error: 'Anchor coordinates outside San Diego area' });
      return;
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

    // Coalesce duplicate in-flight requests for same anchor
    const langCode = getLangCode(language);
    const coalescingKey = `block_${sanitizeFilename(anchor.id || anchor.name)}_${langCode}`;
    const blockCacheKey = buildBlockCacheKey(anchorLat, anchorLng, blockMetrics.radiusMiles || 0.25, langCode);
    const report = await coalesceAndGenerate(
      coalescingKey,
      () => generateBlockReport(anchor, blockMetrics, language, demographics),
      async (r) => {
        await saveCachedReportByKey(blockCacheKey, r);
        await saveCachedBlockReport(anchorCacheId, language, r);
      },
    );

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

// POST /api/report/generate-address-block — Generate an address-anchored block report
router.post('/generate-address-block', async (req: Request, res: Response) => {
  try {
    const { address, lat, lng, language, communityMetrics } = req.body;

    if (!address || lat == null || lng == null) {
      res.status(400).json({ error: 'Missing required fields: address, lat, lng' });
      return;
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      res.status(400).json({ error: 'lat and lng must be valid numbers' });
      return;
    }
    if (latNum < SD_BOUNDS.latMin || latNum > SD_BOUNDS.latMax || lngNum < SD_BOUNDS.lngMin || lngNum > SD_BOUNDS.lngMax) {
      res.status(400).json({ error: 'Coordinates outside San Diego area' });
      return;
    }

    if (!language) {
      res.status(400).json({ error: 'Missing required field: language' });
      return;
    }
    if (!validateLanguage(language, res)) return;

    const radiusMiles = Math.min(2, Math.max(0.1, Number(req.body.radiusMiles) || 0.25));

    // Fetch block data server-side instead of trusting client-supplied blockMetrics
    const blockMetrics = await fetchBlockData(latNum, lngNum, radiusMiles);
    const communityName = blockMetrics.communityName || req.body.communityName || 'San Diego';

    const langCode = getLangCode(language);
    const cacheKey = buildBlockCacheKey(latNum, lngNum, radiusMiles, langCode);

    const report = await coalesceAndGenerate(
      cacheKey,
      () => generateAddressBlockReport(
        address, latNum, lngNum,
        communityName,
        blockMetrics, communityMetrics || null, language,
      ),
      (r) => saveCachedReportByKey(cacheKey, r),
    );

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error generating address block report';
    logger.error('Address block report generation error', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
