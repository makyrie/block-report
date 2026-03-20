import { Router } from 'express';
import { getLibraries, getRecCenters, getTransitStops } from '../services/locations.js';
import { getNeighborhoodsGeoJSON } from '../services/communities.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/libraries', async (_req, res) => {
  try {
    const data = await getLibraries();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch libraries', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const data = await getRecCenters();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch rec centers', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/transit-stops', async (_req, res) => {
  try {
    const data = await getTransitStops();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch transit stops', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/neighborhoods', async (_req, res) => {
  try {
    const data = await getNeighborhoodsGeoJSON();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch neighborhoods', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
