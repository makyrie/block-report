import { Router } from 'express';
import { getProcessedCommunityMetrics } from '../services/metrics.js';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import type { CommunityTrends } from '../../src/types/index.js';
import { validateCommunityParam } from '../utils/community.js';
import { validateCommunity } from '../utils/validation.js';

const PERMIT_GOOD_NEWS_WINDOW_DAYS = 180;

const router = Router();

// In-memory cache for trends data (24h TTL, keyed by community name)
const TRENDS_TTL = 24 * 60 * 60 * 1000;
const TRENDS_MAX_SIZE = 100;
const TRENDS_SWEEP_INTERVAL = 60 * 60 * 1000; // sweep every hour
const trendsCache = new Map<string, { data: CommunityTrends; cachedAt: number }>();

// Periodic sweep to evict stale entries proactively
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of trendsCache) {
    if (now - entry.cachedAt >= TRENDS_TTL) {
      trendsCache.delete(key);
    }
  }
}, TRENDS_SWEEP_INTERVAL).unref();

router.get('/', async (req, res) => {
  const cleaned = validateCommunityParam(req.query.community as string | undefined);
  if (!cleaned) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  try {
    const [result, recentPermits] = await Promise.all([
      getProcessedCommunityMetrics(cleaned),
      prisma.permit.count({
        where: {
          community: cleaned,
          date_issued: { gte: new Date(Date.now() - PERMIT_GOOD_NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
        },
      }).catch((err: Error) => {
        logger.error('Failed to fetch permit good news', { error: err.message });
        return 0;
      }),
    ]);

    // Append permit good news signal
    if (recentPermits > 0) {
      result.goodNews.push(
        `${recentPermits} building permits were issued in the last 6 months — a sign of active investment in the neighborhood.`
      );
    }

    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch 311 metrics', { error: err instanceof Error ? err.message : String(err), community: cleaned });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/trends', async (req, res) => {
  const cleaned = validateCommunity(req, res);
  if (!cleaned) return;

  try {
    const cacheKey = cleaned.toLowerCase();
    const cached = trendsCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.cachedAt < TRENDS_TTL) {
        res.json(cached.data);
        return;
      }
      // Evict stale entry
      trendsCache.delete(cacheKey);
    }

    const result = await prisma.$queryRaw<{ get_community_trends: CommunityTrends }[]>`
      SELECT get_community_trends(${cleaned})
    `;
    const row = result[0];
    if (!row?.get_community_trends) {
      logger.error('get_community_trends returned no data', { community: cleaned });
      res.status(404).json({ error: 'No trend data available for this community' });
      return;
    }
    const data = row.get_community_trends;
    // Evict oldest entry if at max size
    if (trendsCache.size >= TRENDS_MAX_SIZE) {
      const oldestKey = trendsCache.keys().next().value;
      if (oldestKey !== undefined) trendsCache.delete(oldestKey);
    }
    trendsCache.set(cacheKey, { data, cachedAt: Date.now() });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch 311 trends', { error: err instanceof Error ? err.message : String(err), community: cleaned });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
