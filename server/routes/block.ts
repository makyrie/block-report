import { Router } from 'express';
import { logger } from '../logger.js';
import { computeBlockMetrics, fetchBlockRequests, type BlockResult } from '../services/block.js';

const router = Router();

// In-memory cache for block results — coordinates are rounded to 4 decimal places
// (~11m precision) so nearby requests share cache entries.
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;
const blockCache = new Map<string, { data: BlockResult; expires: number }>();

function cacheKey(lat: number, lng: number, radius: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
}

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

  // Check cache (re-insert on hit to maintain LRU order)
  const key = cacheKey(lat, lng, radius);
  const cached = blockCache.get(key);
  if (cached && cached.expires > Date.now()) {
    // Move to end of Map iteration order (most-recently-used)
    blockCache.delete(key);
    blockCache.set(key, cached);
    res.json(cached.data);
    return;
  }

  let data;
  try {
    data = await fetchBlockRequests(lat, lng, radius);
  } catch (err) {
    logger.error('Failed to fetch block data', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const result = computeBlockMetrics(data, lat, lng, radius);

  // Store in cache, evicting least-recently-used entry if over limit
  if (blockCache.size >= MAX_CACHE_SIZE) {
    const lruKey = blockCache.keys().next().value;
    if (lruKey !== undefined) blockCache.delete(lruKey);
  }
  blockCache.set(key, { data: result, expires: Date.now() + CACHE_TTL });

  res.json(result);
});

export default router;
