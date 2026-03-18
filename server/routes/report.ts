import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateReport, generateBlockReport, generateAddressBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, StoredBlockReport } from '../../src/types/index.js';
import { getCachedReport, saveCachedReport, buildBlockCacheKey, getCachedReportByKey, saveCachedReportByKey } from '../services/report-cache.js';
import { VALID_LANGUAGES, getLangCode, sanitizeFilename } from '../utils/language.js';
import { SD_BOUNDS } from '../utils/geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'cache', 'reports');
const BLOCK_REPORTS_DIR = path.join(REPORTS_DIR, 'blocks');

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
  report: {
    neighborhoodName: string;
    language: string;
    generatedAt: string;
    summary: string;
    goodNews: string[];
    topIssues: string[];
    howToParticipate: string[];
    contactInfo: {
      councilDistrict: string;
      phone311: string;
      anchorLocation: string;
    };
  };
}

const PRE_GENERATED_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
      if (age > PRE_GENERATED_TTL_MS) return null;
    }
    return stored;
  } catch {
    return null;
  }
}

// In-flight request coalescing for Claude API calls
const inFlightGenerations = new Map<string, Promise<import('../../src/types/index.js').CommunityReport>>();

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
      res.status(404).json({ error: 'No pre-generated report available' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Community report lookup error', { error: message });
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

    if (!validateLanguage(language, res)) return;

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'lat and lng must be valid numbers' });
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Block report lookup error', { error: message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { profile, language } = req.body as {
      profile: NeighborhoodProfile;
      language: string;
    };

    if (!profile || !language) {
      res.status(400).json({ error: 'Missing required fields: profile, language' });
      return;
    }
    if (!validateLanguage(language, res)) return;

    // Check for a pre-generated report first
    const preGenerated = await getPreGeneratedReport(profile.communityName, language);
    if (preGenerated) {
      logger.info('Serving pre-generated report', {
        community: profile.communityName,
        language,
        generatedAt: preGenerated.generatedAt,
      });
      res.json({
        ...preGenerated.report,
        preGenerated: true,
        dataAsOf: preGenerated.dataAsOf,
      });
      return;
    }

    // Fall back to on-demand generation
    logger.info('No pre-generated report found, generating on-demand', {
      community: profile.communityName,
      language,
    });
    const report = await generateReport(profile, language);

    // Cache the generated report for future instant access
    try {
      await saveCachedReport(profile.communityName, language, report);
    } catch (err) {
      logger.error('Failed to cache report', { error: err instanceof Error ? err.message : String(err) });
    }

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error generating report';
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
    const { anchor, blockMetrics, language, demographics } = req.body;

    if (!anchor || !blockMetrics || !language) {
      res.status(400).json({ error: 'Missing required fields: anchor, blockMetrics, language' });
      return;
    }
    if (!validateLanguage(language, res)) return;

    // Check for a pre-generated block report first
    const langCode = getLangCode(language);
    const filename = `${sanitizeFilename(anchor.id || anchor.name)}_${langCode}.json`;
    const filePath = path.join(BLOCK_REPORTS_DIR, filename);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stored = JSON.parse(content) as StoredBlockReport;
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
    } catch {
      // No cached version — generate on-demand
    }

    logger.info('Generating block report on-demand', {
      anchor: anchor.name,
      language,
    });

    const report = await generateBlockReport(anchor, blockMetrics, language, demographics);
    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error generating block report';
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
    const { address, lat, lng, communityName, blockMetrics, language, communityMetrics } = req.body;

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

    if (!blockMetrics || !language) {
      res.status(400).json({ error: 'Missing required fields: blockMetrics, language' });
      return;
    }
    if (!validateLanguage(language, res)) return;

    const langCode = getLangCode(language);
    const cacheKey = buildBlockCacheKey(lat, lng, blockMetrics.radiusMiles, langCode);

    // Coalesce duplicate in-flight requests for the same location
    let reportPromise = inFlightGenerations.get(cacheKey);
    if (!reportPromise) {
      logger.info('Generating address block report on-demand', {
        address,
        community: communityName,
        language,
      });

      reportPromise = generateAddressBlockReport(
        address,
        lat,
        lng,
        communityName || 'San Diego',
        blockMetrics,
        communityMetrics || null,
        language,
      );
      inFlightGenerations.set(cacheKey, reportPromise);
      reportPromise.finally(() => inFlightGenerations.delete(cacheKey));
    } else {
      logger.info('Coalescing duplicate address block report request', { cacheKey });
    }

    const report = await reportPromise;

    // Cache the generated block report for future instant access
    try {
      await saveCachedReportByKey(cacheKey, report);
    } catch (err) {
      logger.error('Failed to cache address block report', { error: err instanceof Error ? err.message : String(err) });
    }

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
