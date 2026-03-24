import { Router } from 'express';
import { getProcessedCommunityMetrics } from '../services/metrics.js';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { validateCommunityParam } from '../utils/community.js';

const PERMIT_GOOD_NEWS_WINDOW_DAYS = 180;

const router = Router();

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

export default router;
