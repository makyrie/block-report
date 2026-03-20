import { Router } from 'express';
import { getDemographicsByTract, getDemographicsByCommunity } from '../services/demographics.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;
  const community = req.query.community as string | undefined;

  if (!tract && !community) {
    res.status(400).json({ error: 'tract or community query parameter is required' });
    return;
  }

  if (tract) {
    try {
      const topLanguages = await getDemographicsByTract(tract);
      if (topLanguages.length === 0) {
        res.status(404).json({ error: 'Tract not found' });
        return;
      }
      res.json({ topLanguages });
    } catch (err) {
      logger.error('Failed to fetch demographics', { error: (err as Error).message, tract });
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }

  try {
    const topLanguages = await getDemographicsByCommunity(community!);
    res.json({ topLanguages });
  } catch (err) {
    logger.error('Failed to fetch demographics', { error: (err as Error).message, community });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
