import { Router } from 'express';
import { getDemographicsByTract, getDemographicsByCommunity } from '../services/demographics.js';
import { logger } from '../logger.js';
import { validateCommunityParam } from '../utils/community.js';

const router = Router();

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;
  const community = validateCommunityParam(req.query.community as string | undefined);

  if (!tract && !community) {
    res.status(400).json({ error: 'tract or community query parameter is required' });
    return;
  }

  // Single tract lookup — validate format (Census FIPS: digits and optional dots)
  if (tract) {
    if (!/^[\d.]+$/.test(tract)) {
      res.status(400).json({ error: 'Invalid tract format' });
      return;
    }
    try {
      const topLanguages = await getDemographicsByTract(tract);
      if (topLanguages.length === 0) {
        res.status(404).json({ error: 'Tract not found' });
        return;
      }
      res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.json({ topLanguages });
      return;
    } catch (err) {
      logger.error('Failed to fetch demographics', { error: err instanceof Error ? err.message : String(err), tract });
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }

  try {
    const topLanguages = await getDemographicsByCommunity(community!);
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({ topLanguages });
  } catch (err) {
    logger.error('Failed to fetch demographics', { error: err instanceof Error ? err.message : String(err), community });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
