import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { haversineDistanceMiles, MILES_PER_LAT_DEG, MILES_PER_LNG_DEG } from '../utils/geo.js';
import { classifyStatus } from '../utils/status.js';

// ── In-memory LRU cache for block queries (keyed by rounded lat/lng/radius) ─
interface BlockResponse {
  totalReports: number;
  openCount: number;
  resolvedCount: number;
  referredCount: number;
  resolutionRate: number;
  avgDaysToResolve: number | null;
  topIssues: { category: string; count: number }[];
  recentlyResolved: { category: string; date: string }[];
  radiusMiles: number;
  reports: {
    id: string;
    lat: number;
    lng: number;
    category: string;
    categoryDetail: string | null;
    status: string;
    statusCategory: 'open' | 'resolved' | 'referred';
    dateRequested: string;
    dateClosed: string | null;
    address: string | null;
  }[];
}

const BLOCK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — block data changes infrequently
const MAX_BLOCK_CACHE_SIZE = 200;
const blockCache = new Map<string, { data: BlockResponse; cachedAt: number }>();

function blockCacheKey(lat: number, lng: number, radius: number): string {
  // Round to ~55 m precision so nearby clicks share a cache entry
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
}

function getCachedBlock(key: string): BlockResponse | null {
  const entry = blockCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > BLOCK_CACHE_TTL) {
    blockCache.delete(key);
    return null;
  }
  // LRU: move to end so least-recently-used entries are evicted first
  blockCache.delete(key);
  blockCache.set(key, entry);
  return entry.data;
}

function setCachedBlock(key: string, data: BlockResponse): void {
  if (blockCache.size >= MAX_BLOCK_CACHE_SIZE) {
    const oldestKey = blockCache.keys().next().value;
    if (oldestKey) blockCache.delete(oldestKey);
  }
  blockCache.set(key, { data, cachedAt: Date.now() });
}

const router = Router();

router.get('/', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius) || 0.25;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query parameters are required' });
    return;
  }

  // Rough San Diego bounding box check
  if (lat < 32.5 || lat > 33.2 || lng < -117.6 || lng > -116.8) {
    res.status(400).json({ error: 'Coordinates are outside the San Diego area' });
    return;
  }

  const ALLOWED_RADII = [0.1, 0.25, 0.5, 1, 2];
  const snappedRadius = ALLOWED_RADII.reduce((best, r) =>
    Math.abs(r - radius) < Math.abs(best - radius) ? r : best,
  );
  // Use snappedRadius for all downstream logic
  const radius_ = snappedRadius;

  const cacheKey = blockCacheKey(lat, lng, radius_);
  const cached = getCachedBlock(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const latDelta = radius_ / MILES_PER_LAT_DEG;
  const lngDelta = radius_ / MILES_PER_LNG_DEG;

  const QUERY_SAFETY_CAP = 10_000;

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
      take: QUERY_SAFETY_CAP,
    });

    if (data.length >= QUERY_SAFETY_CAP) {
      logger.warn('Block query hit safety cap — aggregates may be incomplete', {
        lat, lng, radius: radius_, resultCount: data.length, cap: QUERY_SAFETY_CAP,
      });
    }
  } catch (err) {
    logger.error('Failed to fetch block data', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Refine with exact Haversine distance
  const nearby = data.filter(
    (r) => r.lat != null && r.lng != null &&
      haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)) <= radius_,
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
    const statusCat = classifyStatus(r.status, r.date_closed);
    if (statusCat === 'resolved') {
      resolvedCount++;
      if (r.date_closed) {
        resolvedWithClosed.push(r);
        if (r.date_requested) {
          resolveDaysSum += (r.date_closed.getTime() - r.date_requested.getTime()) / (1000 * 60 * 60 * 24);
          resolvedWithDatesCount++;
        }
      }
    } else if (statusCat === 'referred') {
      referredCount++;
    } else {
      openCount++;
    }

    // Issue counts
    const issueName = r.service_name || 'Unknown';
    issueCounts[issueName] = (issueCounts[issueName] || 0) + 1;
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

  // Cap individual reports — nearby preserves Prisma's date_requested DESC order
  const MAX_REPORTS = 500;
  const reports = nearby
    .slice(0, MAX_REPORTS)
    .map((r) => {
      const statusCategory = classifyStatus(r.status, r.date_closed);
      return {
        id: r.service_request_id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        category: r.service_name || 'Unknown',
        categoryDetail: r.service_name_detail || null,
        status: r.status || 'Unknown',
        statusCategory,
        dateRequested: r.date_requested?.toISOString() ?? '',
        dateClosed: r.date_closed?.toISOString() ?? null,
        address: r.street_address || null,
      };
    });

  const result = {
    totalReports: nearby.length,
    openCount,
    resolvedCount,
    referredCount,
    resolutionRate,
    avgDaysToResolve,
    topIssues,
    recentlyResolved,
    radiusMiles: radius_,
    reports,
  };

  setCachedBlock(cacheKey, result);
  res.json(result);
});

export default router;
