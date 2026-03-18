import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';

// ── In-memory cache for block queries (keyed by rounded lat/lng/radius) ──────
const BLOCK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — block data changes infrequently
const MAX_BLOCK_CACHE_SIZE = 200;
const blockCache = new Map<string, { data: unknown; cachedAt: number }>();

function blockCacheKey(lat: number, lng: number, radius: number): string {
  // Round to ~55 m precision so nearby clicks share a cache entry
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
}

function getCachedBlock(key: string): unknown | null {
  const entry = blockCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > BLOCK_CACHE_TTL) {
    blockCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedBlock(key: string, data: unknown): void {
  if (blockCache.size >= MAX_BLOCK_CACHE_SIZE) {
    const oldestKey = blockCache.keys().next().value;
    if (oldestKey) blockCache.delete(oldestKey);
  }
  blockCache.set(key, { data, cachedAt: Date.now() });
}

const router = Router();

// 1 degree of latitude ~ 69 miles; longitude varies by latitude
const MILES_PER_LAT_DEG = 69;
// At San Diego (~32.7°N): 1 deg longitude ~ 58.8 miles
const MILES_PER_LNG_DEG = 58.8;

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  const cacheKey = blockCacheKey(lat, lng, radius);
  const cached = getCachedBlock(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const latDelta = radius / MILES_PER_LAT_DEG;
  const lngDelta = radius / MILES_PER_LNG_DEG;

  let data;
  try {
    data = await prisma.request311.findMany({
      select: {
        service_request_id: true,
        service_name: true,
        service_name_detail: true,
        status: true,
        date_requested: true,
        date_closed: true,
        lat: true,
        lng: true,
        street_address: true,
      },
      where: {
        lat: { gte: lat - latDelta, lte: lat + latDelta },
        lng: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      orderBy: { date_requested: 'desc' },
    });
  } catch (err) {
    logger.error('Failed to fetch block data', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Refine with exact Haversine distance
  const nearby = data.filter(
    (r) => r.lat != null && r.lng != null &&
      haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)) <= radius,
  );

  // Single pass: compute all aggregate stats + collect resolved-with-dates
  const issueCounts: Record<string, number> = {};
  let openCount = 0;
  let resolvedCount = 0;
  let referredCount = 0;
  let resolveDaysSum = 0;
  let resolvedWithDatesCount = 0;
  const resolvedWithClosed: typeof nearby = [];

  for (const r of nearby) {
    // Three-way classification matching frontend display
    const isClosed = r.status === 'Closed' || !!r.date_closed;
    const isReferred = !isClosed && /referred/i.test(r.status || '');
    if (isClosed) {
      resolvedCount++;
      if (r.date_closed) {
        resolvedWithClosed.push(r);
        if (r.date_requested) {
          resolveDaysSum += (r.date_closed.getTime() - r.date_requested.getTime()) / (1000 * 60 * 60 * 24);
          resolvedWithDatesCount++;
        }
      }
    } else if (isReferred) {
      referredCount++;
    } else {
      openCount++;
    }

    // Issue counts
    const cat = r.service_name || 'Unknown';
    issueCounts[cat] = (issueCounts[cat] || 0) + 1;
  }

  const resolutionRate = nearby.length > 0 ? resolvedCount / nearby.length : 0;
  const avgDaysToResolve = resolvedWithDatesCount > 0
    ? Math.round((resolveDaysSum / resolvedWithDatesCount) * 10) / 10
    : null;

  const topIssues = Object.entries(issueCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }));

  const recentlyResolved = [...resolvedWithClosed]
    .sort((a, b) => b.date_closed!.getTime() - a.date_closed!.getTime())
    .slice(0, 5)
    .map((r) => ({ category: r.service_name || 'Unknown', date: r.date_closed!.toISOString() }));

  // Individual reports: sort copy by most recent, cap at 500
  const MAX_REPORTS = 500;
  const reports = [...nearby]
    .sort((a, b) => {
      const aTime = a.date_requested?.getTime() ?? 0;
      const bTime = b.date_requested?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, MAX_REPORTS)
    .map((r) => ({
      id: r.service_request_id,
      lat: Number(r.lat),
      lng: Number(r.lng),
      category: r.service_name || 'Unknown',
      categoryDetail: r.service_name_detail || null,
      status: r.status || 'Unknown',
      dateRequested: r.date_requested?.toISOString() ?? '',
      dateClosed: r.date_closed?.toISOString() ?? null,
      address: r.street_address || null,
    }));

  const result = {
    totalReports: nearby.length,
    openCount,
    resolvedCount,
    referredCount,
    resolutionRate,
    avgDaysToResolve,
    topIssues,
    recentlyResolved,
    radiusMiles: radius,
    reports,
  };

  setCachedBlock(cacheKey, result);
  res.json(result);
});

export default router;
