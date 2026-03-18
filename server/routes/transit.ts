import { Router } from 'express';
import { logger } from '../logger.js';
import { getTransitScores, getCityAverage } from '../services/transit-scores.js';

const router = Router();

router.get('/', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  const cleaned = community.replace(/[%_]/g, '');
  if (cleaned.length > 100 || cleaned.length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return;
  }

  try {
    const scores = await getTransitScores();
    const key = cleaned.toUpperCase();
    const score = scores.get(key);

    if (!score) {
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

    res.json({
      ...score,
      cityAverage: getCityAverage(scores),
    });
  } catch (err) {
    logger.error('Failed to compute transit scores', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
