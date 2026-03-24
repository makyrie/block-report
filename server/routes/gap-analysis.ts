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
      res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.json({
        accessGapScore: null,
        signals: { lowEngagement: null, lowTransit: null, highNonEnglish: null },
        rank: null,
        totalCommunities: 0,
      });
      return;
    }

    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(result);
  } catch (err) {
    logger.error('Failed to compute access gap score', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/access-gap/ranking?limit={n}
// limit=all  → returns all communities (capped at 200)
// limit=0    → alias for "all" (deprecated, use limit=all)
// limit=N    → returns top N (capped at 200)
// no limit   → defaults to 10
router.get('/ranking', async (req, res) => {
  const MAX_RESULTS = 200;
  const rawLimit = req.query.limit;
  const parsed = Number(rawLimit);
  const limit = (rawLimit === 'all' || rawLimit === '0')
    ? MAX_RESULTS
    : (Number.isFinite(parsed) && parsed > 0)
      ? Math.min(Math.round(parsed), MAX_RESULTS)
      : 10;

  try {
    const [ranking, allScores] = await Promise.all([
      getTopUnderserved(limit),
      getAccessGapScores(),
    ]);
    const withGaps = Array.from(allScores.values()).filter((r) => r.accessGapScore >= 50).length;
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({
      ranking,
      summary: { total: allScores.size, withGaps },
    });
  } catch (err) {
    logger.error('Failed to compute access gap ranking', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
