import { Router } from 'express';
import { getBlockMetrics } from '../services/block.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat(req.query.radius as string) || 0.25;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query parameters are required' });
    return;
  }

  if (lat < 32.5 || lat > 33.2 || lng < -117.6 || lng > -116.8) {
    res.status(400).json({ error: 'Coordinates are outside the San Diego area' });
    return;
  }

  if (radius < 0.1 || radius > 2) {
    res.status(400).json({ error: 'Radius must be between 0.1 and 2 miles' });
    return;
  }

  try {
    const result = await getBlockMetrics(lat, lng, radius);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch block data', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
