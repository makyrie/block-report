import { Router } from 'express';
import { getProcessedCommunityMetrics } from '../services/metrics.js';
import { logger } from '../logger.js';

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
    const result = await getProcessedCommunityMetrics(cleaned);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch 311 metrics', { error: (err as Error).message, community });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
