import { Router } from 'express';
import { getAccessGapScore, getAccessGapScores, getTopUnderserved } from '../services/gap-analysis.js';
import { logger } from '../logger.js';
import { validateCommunityParam } from '../utils/community.js';

const router = Router();

// GET /api/access-gap?community={name}
router.get('/', async (req, res) => {
  const cleaned = validateCommunityParam(req.query.community as string | undefined);
  if (!cleaned) {
    res.status(400).json({ error: 'community query parameter is required' });
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

// GET /api/access-gap/ranking?limit={n}  (limit=0 returns all, capped at 200)
router.get('/ranking', async (req, res) => {
  const MAX_RESULTS = 200;
  const rawLimit = req.query.limit;
  const parsed = Number(rawLimit);
  const limit = (rawLimit === '0' || rawLimit === 'all')
    ? MAX_RESULTS
    : (Number.isFinite(parsed) && parsed > 0)
      ? Math.min(Math.round(parsed), MAX_RESULTS)
      : 10;

  try {
    const allScores = await getAccessGapScores();
    const ranking = await getTopUnderserved(limit);
    const allEntries = Array.from(allScores.values());
    const withGaps = allEntries.filter((r) => r.accessGapScore >= 50).length;
    res.json({
      ranking,
      summary: { total: allScores.size, withGaps },
    });
  } catch (err) {
    logger.error('Failed to compute access gap ranking', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
