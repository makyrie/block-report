import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';

const router = Router();

// In-memory cache for block results — coordinates are rounded to 4 decimal places
// (~11m precision) so nearby requests share cache entries.
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;
const blockCache = new Map<string, { data: Record<string, unknown>; expires: number }>();

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

  // Use Haversine formula in SQL to filter by exact distance and aggregate in the database.
  // This avoids fetching thousands of rows into Node.js.
  const R = 3958.8; // Earth radius in miles

  // Pre-filter with a lat/lng bounding box to let Postgres use indexes before the expensive Haversine
  const latDelta = radius / 69.0; // ~69 miles per degree of latitude
  const lngDelta = radius / (69.0 * Math.cos((lat * Math.PI) / 180));

  try {
    // Aggregate counts and avg resolution time in SQL
    const [stats] = await prisma.$queryRaw<Array<{
      total: bigint;
      open_count: bigint;
      resolved_count: bigint;
      avg_days_to_resolve: number | null;
    }>>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status != 'Closed' AND date_closed IS NULL)::bigint AS open_count,
        COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::bigint AS resolved_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (date_closed - date_requested)) / 86400)
          FILTER (WHERE date_requested IS NOT NULL AND date_closed IS NOT NULL)::numeric, 1)
          AS avg_days_to_resolve
      FROM request311
      WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
        AND (${R} * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(lat - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(lat)) * POWER(SIN(RADIANS(lng - ${lng}) / 2), 2)
          ))) <= ${radius}
    `;

    // Top issues — grouped in SQL, limited to top 6
    const topIssues = await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
      SELECT COALESCE(service_name, 'Unknown') AS category, COUNT(*)::bigint AS count
      FROM request311
      WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
        AND (${R} * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(lat - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(lat)) * POWER(SIN(RADIANS(lng - ${lng}) / 2), 2)
          ))) <= ${radius}
      GROUP BY service_name
      ORDER BY count DESC
      LIMIT 6
    `;

    // Recently resolved — only fetch 5 rows
    const recentlyResolved = await prisma.$queryRaw<Array<{ category: string; date: Date }>>`
      SELECT COALESCE(service_name, 'Unknown') AS category, date_closed AS date
      FROM request311
      WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
        AND (${R} * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(lat - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(lat)) * POWER(SIN(RADIANS(lng - ${lng}) / 2), 2)
          ))) <= ${radius}
        AND date_closed IS NOT NULL
        AND (status = 'Closed' OR date_closed IS NOT NULL)
      ORDER BY date_closed DESC
      LIMIT 5
    `;

    const totalRequests = Number(stats.total);
    const openCount = Number(stats.open_count);
    const resolvedCount = Number(stats.resolved_count);
    const resolutionRate = totalRequests > 0 ? resolvedCount / totalRequests : 0;

    const data = {
      totalRequests,
      openCount,
      resolvedCount,
      resolutionRate,
      avgDaysToResolve: stats.avg_days_to_resolve != null ? Number(stats.avg_days_to_resolve) : null,
      topIssues: topIssues.map((r) => ({ category: r.category, count: Number(r.count) })),
      recentlyResolved: recentlyResolved.map((r) => ({ category: r.category, date: r.date.toISOString() })),
      radiusMiles: radius,
    };

    // Store in cache, evicting least-recently-used entry if over limit
    if (blockCache.size >= MAX_CACHE_SIZE) {
      const lruKey = blockCache.keys().next().value;
      if (lruKey !== undefined) blockCache.delete(lruKey);
    }
    blockCache.set(key, { data, expires: Date.now() + CACHE_TTL });

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch block data', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
