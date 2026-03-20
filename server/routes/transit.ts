import { Router } from 'express';
import { getTransitScores, getTransitScore, getCityAverage as computeCityAverage } from '../services/transit.js';
import { parseAndValidateCommunity } from './validate-community.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const normalized = await parseAndValidateCommunity(req, res);
  if (!normalized) return;

  try {
    const result = await getTransitScore(normalized);

    if (!result) {
      const scores = await getTransitScores();
      res.json({
        stopCount: 0,
        agencyCount: 0,
        agencies: [],
        transitScore: 0,
        cityAverage: computeCityAverage(scores),
        travelTimeToCityHall: null,
      });
      return;
    }

    res.json(result);
  } catch (err) {
    logger.error('Failed to compute transit scores', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
