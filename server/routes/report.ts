import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateReport, generateBlockReport } from '../services/claude.js';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, BlockMetrics, CommunityAnchor } from '../../src/types/index.js';
import { getCachedReport, saveCachedReport, getCachedBlockReport, saveCachedBlockReport, isGenerationRateLimited } from '../services/report-cache.js';
import { validateCommunityParam } from '../utils/community.js';

/** Maximum serialized prompt size (bytes) to prevent cost amplification */
const MAX_PROFILE_JSON_SIZE = 8_000;

/** Pick only known NeighborhoodProfile fields from an untrusted object */
function pickProfileFields(raw: Record<string, unknown>): NeighborhoodProfile {
  const metrics = raw.metrics && typeof raw.metrics === 'object' ? raw.metrics as Record<string, unknown> : {};
  const transit = raw.transit && typeof raw.transit === 'object' ? raw.transit as Record<string, unknown> : {};
  const demographics = raw.demographics && typeof raw.demographics === 'object' ? raw.demographics as Record<string, unknown> : {};
  const anchor = raw.anchor && typeof raw.anchor === 'object' ? raw.anchor as Record<string, unknown> : {};
  const accessGap = raw.accessGap && typeof raw.accessGap === 'object' ? raw.accessGap as Record<string, unknown> : null;

  return {
    communityName: String(raw.communityName ?? ''),
    anchor: {
      id: String(anchor.id ?? ''),
      name: String(anchor.name ?? ''),
      type: anchor.type === 'rec_center' ? 'rec_center' : 'library',
      lat: Number(anchor.lat) || 0,
      lng: Number(anchor.lng) || 0,
      address: String(anchor.address ?? ''),
      community: String(anchor.community ?? ''),
    },
    metrics: {
      totalRequests311: Number(metrics.totalRequests311) || 0,
      resolvedCount: Number(metrics.resolvedCount) || 0,
      resolutionRate: Number(metrics.resolutionRate) || 0,
      avgDaysToResolve: Number(metrics.avgDaysToResolve) || 0,
      topIssues: Array.isArray(metrics.topIssues) ? (metrics.topIssues as { category: string; count: number }[]).slice(0, 20) : [],
      recentlyResolved: Array.isArray(metrics.recentlyResolved) ? (metrics.recentlyResolved as { category: string; date: string }[]).slice(0, 20) : [],
      population: Number(metrics.population) || 0,
      requestsPer1000Residents: metrics.requestsPer1000Residents != null ? Number(metrics.requestsPer1000Residents) : null,
      goodNews: Array.isArray(metrics.goodNews) ? (metrics.goodNews as string[]).slice(0, 10) : [],
    },
    transit: {
      nearbyStopCount: Number(transit.nearbyStopCount) || 0,
      nearestStopDistance: Number(transit.nearestStopDistance) || 0,
      stopCount: Number(transit.stopCount) || 0,
      agencyCount: Number(transit.agencyCount) || 0,
      agencies: Array.isArray(transit.agencies) ? (transit.agencies as string[]).slice(0, 20) : [],
      transitScore: Number(transit.transitScore) || 0,
      cityAverage: Number(transit.cityAverage) || 0,
      travelTimeToCityHall: transit.travelTimeToCityHall != null ? Number(transit.travelTimeToCityHall) : null,
    },
    demographics: {
      topLanguages: Array.isArray(demographics.topLanguages) ? (demographics.topLanguages as { language: string; percentage: number }[]).slice(0, 20) : [],
    },
    accessGap: accessGap ? (() => {
      const ag = accessGap as Record<string, unknown>;
      const signals = ag.signals && typeof ag.signals === 'object'
        ? ag.signals as Record<string, unknown>
        : {} as Record<string, unknown>;
      const pickSignal = (key: string): number | null =>
        signals[key] != null ? Number(signals[key]) : null;
      return {
        accessGapScore: Number(ag.accessGapScore) || 0,
        signals: {
          lowEngagement: pickSignal('lowEngagement'),
          lowTransit: pickSignal('lowTransit'),
          highNonEnglish: pickSignal('highNonEnglish'),
        },
        rank: Number(ag.rank) || 0,
        totalCommunities: Number(ag.totalCommunities) || 0,
      };
    })() : null,
  };
}

/** Pick only known BlockMetrics fields from an untrusted object */
function pickBlockMetricsFields(raw: Record<string, unknown>): BlockMetrics {
  return {
    totalRequests: Number(raw.totalRequests) || 0,
    openCount: Number(raw.openCount) || 0,
    resolvedCount: Number(raw.resolvedCount) || 0,
    resolutionRate: Number(raw.resolutionRate) || 0,
    avgDaysToResolve: raw.avgDaysToResolve != null ? Number(raw.avgDaysToResolve) : null,
    topIssues: Array.isArray(raw.topIssues) ? (raw.topIssues as { category: string; count: number }[]).slice(0, 20) : [],
    recentlyResolved: Array.isArray(raw.recentlyResolved) ? (raw.recentlyResolved as { category: string; date: string }[]).slice(0, 20) : [],
    radiusMiles: Number(raw.radiusMiles) || 0,
  };
}

/** Pick only known demographics fields */
function pickDemographicsFields(raw: Record<string, unknown>): { topLanguages: { language: string; percentage: number }[] } {
  return {
    topLanguages: Array.isArray(raw.topLanguages) ? (raw.topLanguages as { language: string; percentage: number }[]).slice(0, 20) : [],
  };
}

const MAX_ANCHOR_FIELD_LEN = 200;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;

/** Pick only known CommunityAnchor fields from an untrusted object, with length + control char sanitization */
function pickAnchorFields(raw: Record<string, unknown>): CommunityAnchor {
  const str = (v: unknown): string =>
    String(v ?? '').slice(0, MAX_ANCHOR_FIELD_LEN).replace(CONTROL_CHAR_RE, '');
  return {
    id: str(raw.id),
    name: str(raw.name),
    type: raw.type === 'rec_center' ? 'rec_center' : 'library',
    lat: Number(raw.lat) || 0,
    lng: Number(raw.lng) || 0,
    address: str(raw.address),
    community: str(raw.community),
  };
}

const router = Router();

// In-flight promise map to deduplicate concurrent generation requests for the same key
const inflight = new Map<string, Promise<import('../../src/types/index.js').CommunityReport>>();

// GET /api/report?community={name}&language={lang} — cached community report
// GET /api/report?lat=X&lng=Y&radius=Z&language=L — cached block-level report (by anchor ID)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Validate language param (shared by both block and community lookups)
    const rawLang = (req.query.language as string) || 'en';
    if (rawLang.length > 50 || /[\x00-\x1f\x7f]/.test(rawLang)) {
      res.status(400).json({ error: 'language must be a printable string of 50 characters or fewer' });
      return;
    }
    const language = rawLang;

    // Block-level lookup by coordinates — delegate to strategy-based cache
    if (req.query.lat && req.query.lng) {
      const anchorId = req.query.anchorId as string;

      if (!anchorId || anchorId.length > 200) {
        res.status(400).json({ error: 'anchorId must be a non-empty string of 200 characters or fewer' });
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
    const community = validateCommunityParam(req.query.community as string);

    if (!community) {
      res.status(400).json({ error: 'Missing or invalid community parameter' });
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
    logger.error('Report lookup error', { error: message, ...(process.env.NODE_ENV !== 'production' && { stack: error instanceof Error ? error.stack : undefined }) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { profile: rawProfile, language } = req.body as {
      profile: unknown;
      language: string;
    };

    if (typeof rawProfile !== 'object' || rawProfile === null || typeof (rawProfile as Record<string, unknown>).communityName !== 'string') {
      res.status(400).json({ error: 'profile must be an object with a communityName string' });
      return;
    }
    if (typeof language !== 'string' || !language || language.length > 50) {
      res.status(400).json({ error: 'language must be a non-empty string of 50 characters or fewer' });
      return;
    }

    // Allowlist profile fields to prevent cost amplification from extra fields
    const profile = pickProfileFields(rawProfile as Record<string, unknown>);

    // Guard against oversized serialized prompts
    const serialized = JSON.stringify(profile);
    if (serialized.length > MAX_PROFILE_JSON_SIZE) {
      res.status(400).json({ error: `Profile data too large (${serialized.length} bytes, max ${MAX_PROFILE_JSON_SIZE})` });
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

    // Fall back to on-demand generation with promise coalescing to prevent duplicate API calls
    const coalescingKey = `community:${profile.communityName}:${language}`;
    let reportPromise = inflight.get(coalescingKey);
    if (!reportPromise) {
      logger.info('No pre-generated report found, generating on-demand', {
        community: profile.communityName,
        language,
      });
      reportPromise = generateReport(profile, language).then((r) => {
        // Save to cache in the background — don't let cache failures reject the promise
        saveCachedReport(profile.communityName, language, r).catch((err) => {
          logger.error('Background cache save failed', { error: err instanceof Error ? err.message : String(err) });
        });
        return r;
      });
      inflight.set(coalescingKey, reportPromise);
      reportPromise.finally(() => inflight.delete(coalescingKey));
    } else {
      logger.info('Coalescing concurrent report request', { community: profile.communityName, language });
    }
    const report = await reportPromise;

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Report generation error', {
      error: message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error instanceof Error ? error.stack : undefined }),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report/generate-block — Generate a block-level report for an anchor location
router.post('/generate-block', async (req: Request, res: Response) => {
  try {
    const { anchor: rawAnchor, blockMetrics: rawBlockMetrics, language, demographics: rawDemographics } = req.body;

    if (!rawAnchor || !rawBlockMetrics || !language) {
      res.status(400).json({ error: 'Missing required fields: anchor, blockMetrics, language' });
      return;
    }

    // Allowlist all user-supplied fields to prevent prompt injection via extra properties
    const anchor = pickAnchorFields(rawAnchor as Record<string, unknown>);
    const blockMetrics = pickBlockMetricsFields(rawBlockMetrics as Record<string, unknown>);
    const demographics = rawDemographics ? pickDemographicsFields(rawDemographics as Record<string, unknown>) : undefined;

    if (typeof language !== 'string' || language.length > 50) {
      res.status(400).json({ error: 'language must be a string of 50 characters or fewer' });
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

    const blockCoalescingKey = `block:${anchorCacheId}:${language}`;
    let blockPromise = inflight.get(blockCoalescingKey);
    if (!blockPromise) {
      logger.info('Generating block report on-demand', {
        anchor: anchor.name,
        language,
      });
      blockPromise = generateBlockReport(anchor, blockMetrics, language, demographics).then((r) => {
        // Save to cache in the background — don't let cache failures reject the promise
        saveCachedBlockReport(anchorCacheId, language, r).catch((err) => {
          logger.error('Background block cache save failed', { error: err instanceof Error ? err.message : String(err) });
        });
        return r;
      });
      inflight.set(blockCoalescingKey, blockPromise);
      blockPromise.finally(() => inflight.delete(blockCoalescingKey));
    } else {
      logger.info('Coalescing concurrent block report request', { anchor: anchor.name, language });
    }
    const report = await blockPromise;

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Block report generation error', {
      error: message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error instanceof Error ? error.stack : undefined }),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
