import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { haversineDistanceMiles } from '../utils/geo.js';

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
      take: 5000,
    });
  } catch (err) {
    logger.error('Failed to fetch block data', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Refine with exact Haversine distance
  const nearby = data.filter(
    (r) => r.lat != null && r.lng != null &&
      haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)) <= radius,
  );

  const open = nearby.filter((r) => r.status !== 'Closed' && !r.date_closed);
  const resolved = nearby.filter((r) => r.status === 'Closed' || r.date_closed);

  // Resolution rate
  const resolutionRate = nearby.length > 0 ? resolved.length / nearby.length : 0;

  // Average days to resolve
  let avgDaysToResolve: number | null = null;
  const resolvedWithDates = resolved.filter((r) => r.date_requested && r.date_closed);
  if (resolvedWithDates.length > 0) {
    const totalDays = resolvedWithDates.reduce((sum, r) => {
      const requested = r.date_requested!.getTime();
      const closed = r.date_closed!.getTime();
      return sum + (closed - requested) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDaysToResolve = Math.round((totalDays / resolvedWithDates.length) * 10) / 10;
  }

  // Top issues (full list, sorted)
  const issueCounts: Record<string, number> = {};
  for (const r of nearby) {
    const cat = r.service_name || 'Unknown';
    issueCounts[cat] = (issueCounts[cat] || 0) + 1;
  }
  const topIssues = Object.entries(issueCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }));

  const recentlyResolved = resolved
    .filter((r) => r.date_closed)
    .sort((a, b) => b.date_closed!.getTime() - a.date_closed!.getTime())
    .slice(0, 5)
    .map((r) => ({ category: r.service_name || 'Unknown', date: r.date_closed!.toISOString() }));

  res.json({
    totalRequests: nearby.length,
    openCount: open.length,
    resolvedCount: resolved.length,
    resolutionRate,
    avgDaysToResolve,
    topIssues,
    recentlyResolved,
    radiusMiles: radius,
  });
});

export default router;
