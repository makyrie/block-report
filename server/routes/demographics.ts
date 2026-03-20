import { Router } from 'express';
import { getDemographicsByTract, getDemographicsByCommunity } from '../services/demographics.js';
import { parseAndValidateCommunity } from './validate-community.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const tract = req.query.tract as string | undefined;

  if (tract) {
    // Validate tract is a 6-digit numeric string
    if (!/^\d{6}$/.test(tract)) {
      res.status(400).json({ error: 'tract must be a 6-digit numeric string' });
      return;
    }
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

  const normalized = await parseAndValidateCommunity(req, res);
  if (!normalized) return;

  try {
    const topLanguages = await getDemographicsByCommunity(normalized);
    res.json({ topLanguages });
  } catch (err) {
    logger.error('Failed to fetch demographics', { error: (err as Error).message, community: normalized });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
