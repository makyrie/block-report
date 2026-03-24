import { Router } from 'express';
import { logger } from '../logger.js';
import { SD_BOUNDS } from '../utils/geo.js';
import { fetchBlockData } from '../services/block-data.js';

const router = Router();

router.get('/', async (req, res) => {
  const lat = parseFloat(String(req.query.lat));
  const lng = parseFloat(String(req.query.lng));
  const radius = parseFloat(String(req.query.radius)) || 0.25;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query parameters are required' });
    return;
  }

  if (lat < SD_BOUNDS.latMin || lat > SD_BOUNDS.latMax || lng < SD_BOUNDS.lngMin || lng > SD_BOUNDS.lngMax) {
    res.status(400).json({ error: 'Coordinates are outside the San Diego area' });
    return;
  }

  if (radius < 0.1 || radius > 2) {
    res.status(400).json({ error: 'Radius must be between 0.1 and 2 miles' });
    return;
  }

  try {
    const result = await fetchBlockData(lat, lng, radius);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch block data', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
