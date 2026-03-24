import { Router } from 'express';
import { getProcessedCommunityMetrics } from '../services/metrics.js';
import { logger } from '../logger.js';
import { validateCommunityParam } from '../utils/community.js';

const router = Router();

router.get('/', async (req, res) => {
  const cleaned = validateCommunityParam(req.query.community as string | undefined);
  if (!cleaned) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  try {
    const result = await getProcessedCommunityMetrics(cleaned);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch 311 metrics', { error: err instanceof Error ? err.message : String(err), community: cleaned });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
