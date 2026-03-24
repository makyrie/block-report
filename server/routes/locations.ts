import { Router } from 'express';
import { getLibraries, getRecCenters, getTransitStops } from '../services/locations.js';
import { getNeighborhoodsGeoJSON } from '../services/communities.js';
import { logger } from '../logger.js';
import { fetchBoundaries } from '../services/boundaries.js';

const router = Router();

router.get('/libraries', async (_req, res) => {
  try {
    const data = await prisma.library.findMany({
      select: { objectid: true, name: true, address: true, lat: true, lng: true, phone: true, website: true },
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch libraries', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const data = await prisma.recCenter.findMany({
      select: { objectid: true, park_name: true, address: true, lat: true, lng: true, neighborhd: true },
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch rec centers', { error: err instanceof Error ? err.message : String(err) });
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

// GET /api/locations/communities — list valid community names (for agents and programmatic use)
router.get('/communities', async (_req, res) => {
  try {
    const data = await fetchBoundaries();
    const names: string[] = [];
    for (const feature of data.features) {
      const name = feature.properties?.cpname || feature.properties?.community || feature.properties?.name;
      if (name) names.push(name as string);
    }
    names.sort();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({ communities: names });
  } catch (err) {
    logger.error('Failed to list communities', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
