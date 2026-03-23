import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { fetchBoundaries } from '../services/boundaries.js';

const router = Router();

router.get('/libraries', async (_req, res) => {
  try {
    const data = await prisma.library.findMany();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch libraries', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const data = await prisma.recCenter.findMany();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch rec centers', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/neighborhoods', async (_req, res) => {
  try {
    const data = await fetchBoundaries();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch neighborhoods', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
