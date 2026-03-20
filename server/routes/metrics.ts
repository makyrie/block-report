import { Router } from 'express';
import { getProcessedCommunityMetrics } from '../services/metrics.js';
import { parseAndValidateCommunity } from './validate-community.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const normalized = await parseAndValidateCommunity(req, res);
  if (!normalized) return;

  try {
    const result = await getProcessedCommunityMetrics(normalized);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch 311 metrics', { error: (err as Error).message, community: normalized });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
