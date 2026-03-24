import { Router } from 'express';
import { logger } from '../logger.js';
import { getTransitScores, getCityAverage } from '../services/transit-scores.js';
import { validateCommunityParam, communityKey } from '../utils/community.js';

const router = Router();


router.get('/', async (req, res) => {
  const cleaned = validateCommunityParam(req.query.community as string | undefined);
  if (!cleaned) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  try {
    const scores = await getTransitScores();
    const key = communityKey(cleaned);
    const score = scores.get(key);

    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    if (!score) {
      res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.json({
        stopCount: 0,
        agencyCount: 0,
        agencies: [],
        transitScore: 0,
        cityAverage: getCityAverage(scores),
        travelTimeToCityHall: null,
      });
      return;
    }

    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({
      ...score,
      cityAverage: getCityAverage(scores),
    });
  } catch (err) {
    logger.error('Failed to compute transit scores', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
