import { Router } from 'express';
import { getTransitScore } from '../services/transit.js';
import { parseAndValidateCommunity } from './validate-community.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const normalized = await parseAndValidateCommunity(req, res);
  if (!normalized) return;

  try {
    const result = await getTransitScore(normalized);

    if (!result) {
      res.status(404).json({ error: `No transit data available for "${normalized}".` });
      return;
    }

    res.json(result);
  } catch (err) {
    logger.error('Failed to compute transit scores', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
