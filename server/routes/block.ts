import { Router } from 'express';
import { getBlockMetrics } from '../services/block.js';
import { logger } from '../logger.js';

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

  // Use Haversine formula in SQL to filter by exact distance and aggregate in the database.
  // This avoids fetching thousands of rows into Node.js.
  const R = 3958.8; // Earth radius in miles

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

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.json({
      totalRequests,
      openCount,
      resolvedCount,
      resolutionRate,
      avgDaysToResolve: stats.avg_days_to_resolve != null ? Number(stats.avg_days_to_resolve) : null,
      topIssues: topIssues.map((r) => ({ category: r.category, count: Number(r.count) })),
      recentlyResolved: recentlyResolved.map((r) => ({ category: r.category, date: r.date.toISOString() })),
      radiusMiles: radius,
    });
  } catch (err) {
    logger.error('Failed to fetch block data', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
