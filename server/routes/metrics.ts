import { Router } from 'express';
import { getProcessedCommunityMetrics } from '../services/metrics.js';
import { normalizeCommunityName } from '../services/communities.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  if (community.length > 100 || community.trim().length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return;
  }

  const normalized = normalizeCommunityName(community);

  try {
    const result = await getProcessedCommunityMetrics(normalized);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch 311 metrics', { error: (err as Error).message, community });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
