import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { fetchBoundaries } from '../services/boundaries.js';

const router = Router();

// Safety cap on location queries — San Diego has ~40 libraries, ~60 rec centers,
// and ~4000 transit stops. 10 000 is generous headroom without being unbounded.
const MAX_LOCATION_ROWS = 10_000;

router.get('/libraries', async (_req, res) => {
  try {
    const data = await prisma.library.findMany({ take: MAX_LOCATION_ROWS });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch libraries', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const data = await prisma.recCenter.findMany({ take: MAX_LOCATION_ROWS });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch rec centers', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/transit-stops', async (_req, res) => {
  try {
    const data = await prisma.transitStop.findMany({
      select: { objectid: true, stop_name: true, lat: true, lng: true },
      take: MAX_LOCATION_ROWS,
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch transit stops', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/neighborhoods', async (_req, res) => {
  try {
    const data = await fetchBoundaries();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch neighborhoods', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
