import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { computeBlockMetrics } from '../services/block.js';

const router = Router();

// 1 degree of latitude ~ 69 miles; longitude varies by latitude
const MILES_PER_LAT_DEG = 69;
// At San Diego (~32.7°N): 1 deg longitude ~ 58.8 miles
const MILES_PER_LNG_DEG = 58.8;

router.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat(req.query.radius as string) || 0.25;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query parameters are required' });
    return;
  }

  // Rough San Diego bounding box check
  if (lat < 32.5 || lat > 33.2 || lng < -117.6 || lng > -116.8) {
    res.status(400).json({ error: 'Coordinates are outside the San Diego area' });
    return;
  }

  if (radius < 0.1 || radius > 2) {
    res.status(400).json({ error: 'Radius must be between 0.1 and 2 miles' });
    return;
  }

  const latDelta = radius / MILES_PER_LAT_DEG;
  const lngDelta = radius / MILES_PER_LNG_DEG;

  let data;
  try {
    const BLOCK_QUERY_LIMIT = 5000;
    data = await prisma.request311.findMany({
      select: {
        service_name: true,
        status: true,
        date_requested: true,
        date_closed: true,
        lat: true,
        lng: true,
      },
      where: {
        lat: { gte: lat - latDelta, lte: lat + latDelta },
        lng: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      take: BLOCK_QUERY_LIMIT,
    });
    if (data.length === BLOCK_QUERY_LIMIT) {
      logger.warn('Block query hit safety cap', { lat, lng, radius, limit: BLOCK_QUERY_LIMIT });
    }
  } catch (err) {
    logger.error('Failed to fetch block data', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  res.json(computeBlockMetrics(data, lat, lng, radius));
});

export default router;
