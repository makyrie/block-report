import { Router } from 'express';
import { getAccessGapScore, getTopUnderserved } from '../services/gap-analysis.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/access-gap?community={name}
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
    const result = await getAccessGapScore(cleaned);

    if (!result) {
      res.json({
        accessGapScore: null,
        signals: { lowEngagement: null, lowTransit: null, highNonEnglish: null },
        rank: null,
        totalCommunities: 0,
      });
      return;
    }

    res.json(result);
  } catch (err) {
    logger.error('Failed to compute access gap score', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/access-gap/ranking?limit={n}
router.get('/ranking', async (_req, res) => {
  const limit = Math.min(Number(_req.query.limit) || 10, 50);

  try {
    const ranking = await getTopUnderserved(limit);
    res.json({ ranking });
  } catch (err) {
    logger.error('Failed to compute access gap ranking', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
