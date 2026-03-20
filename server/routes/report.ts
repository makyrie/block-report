import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateReport, generateBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, StoredBlockReport } from '../../src/types/index.js';
import { getCachedReport, saveCachedReport } from '../services/report-cache.js';
import { isVercel } from '../env.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'cache', 'reports');
const BLOCK_REPORTS_DIR = path.join(REPORTS_DIR, 'blocks');

const LANGUAGE_CODES: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  Chinese: 'zh',
  Vietnamese: 'vi',
  Tagalog: 'tl',
  Korean: 'ko',
  Arabic: 'ar',
  'French/Haitian/Cajun': 'fr',
  'German/West Germanic': 'de',
  'Russian/Polish/Slavic': 'ru',
};

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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

async function getPreGeneratedReport(
  communityName: string,
  language: string,
): Promise<StoredReport | null> {
  if (isVercel) return null; // No persistent filesystem on serverless

  const langCode = LANGUAGE_CODES[language] || language.toLowerCase().slice(0, 2);
  const filename = `${sanitizeFilename(communityName)}_${langCode}.json`;
  const filePath = path.join(REPORTS_DIR, filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as StoredReport;
  } catch {
    return null;
  }
}

const router = Router();

// GET /api/report?community={name}&language={lang} — pre-generated community report
// GET /api/report?lat=X&lng=Y&radius=Z&language=L — pre-generated block-level report
router.get('/', async (req: Request, res: Response) => {
  try {
    // Block-level lookup by coordinates
    if (req.query.lat && req.query.lng) {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const radius = parseFloat(req.query.radius as string) || 0.25;
      const language = (req.query.language as string) || 'en';

      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({ error: 'lat and lng must be valid numbers' });
        return;
      }

      if (isVercel) {
        res.status(404).json({ error: 'No pre-generated block report found for this location' });
        return;
      }

      const files = await fs.readdir(BLOCK_REPORTS_DIR).catch(() => [] as string[]);
      const langSuffix = `_${language}.json`;
      const COORD_TOLERANCE = 0.0002; // ~0.01 miles in degrees

      for (const file of files) {
        if (!file.endsWith(langSuffix)) continue;

        try {
          const content = await fs.readFile(path.join(BLOCK_REPORTS_DIR, file), 'utf-8');
          const stored = JSON.parse(content) as StoredBlockReport;

          if (
            Math.abs(stored.lat - lat) < COORD_TOLERANCE &&
            Math.abs(stored.lng - lng) < COORD_TOLERANCE &&
            stored.radiusMiles === radius
          ) {
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
          // Skip malformed files
        }
      }

      res.status(404).json({ error: 'No pre-generated block report found for this location' });
      return;
    }

    // Community-level lookup by name
    const community = req.query.community as string;
    const language = req.query.language as string || 'English';

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
    logger.error('Report lookup error', { error: message });
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

// POST /api/report/generate-block — Generate a block-level report for an anchor location
router.post('/generate-block', async (req: Request, res: Response) => {
  try {
    const { anchor, blockMetrics, language, demographics } = req.body;

    if (!anchor || !blockMetrics || !language) {
      res.status(400).json({ error: 'Missing required fields: anchor, blockMetrics, language' });
      return;
    }

    // Check for a pre-generated block report first (skip on serverless — no persistent filesystem)
    if (!isVercel) {
      const langCode = LANGUAGE_CODES[language] || language.toLowerCase().slice(0, 2);
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

export default router;
