import { prisma } from './db.js';
import { logger } from '../logger.js';
import { haversineDistanceMiles, MILES_PER_LAT_DEG, MILES_PER_LNG_DEG } from '../utils/geo.js';
import type { BlockMetrics } from '../../src/types/index.js';

// In-memory cache for block data (5-minute TTL, bounded size)
const BLOCK_CACHE_TTL_MS = 5 * 60 * 1000;
const BLOCK_CACHE_MAX_ENTRIES = 500;
const blockCache = new Map<string, { data: BlockMetrics; expiry: number }>();

function evictStaleEntries(): void {
  if (blockCache.size === 0) return;
  const now = Date.now();
  for (const [key, entry] of blockCache) {
    if (entry.expiry <= now) blockCache.delete(key);
  }
}

function blockCacheSet(key: string, data: BlockMetrics): void {
  if (blockCache.size >= BLOCK_CACHE_MAX_ENTRIES) {
    evictStaleEntries();
  }
  // If still at capacity, delete the oldest entry
  if (blockCache.size >= BLOCK_CACHE_MAX_ENTRIES) {
    const oldest = blockCache.keys().next().value;
    if (oldest !== undefined) blockCache.delete(oldest);
  }
  blockCache.set(key, { data, expiry: Date.now() + BLOCK_CACHE_TTL_MS });
}

function getBlockCacheKey(lat: number, lng: number, radius: number): string {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}_${radius}`;
}

/** Fetch and compute block-level metrics for a given location and radius. */
export async function fetchBlockData(lat: number, lng: number, radius: number): Promise<BlockMetrics> {
  // Check in-memory cache
  const cacheKey = getBlockCacheKey(lat, lng, radius);
  const cached = blockCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const latDelta = radius / MILES_PER_LAT_DEG;
  const lngDelta = radius / MILES_PER_LNG_DEG;

  const data = await prisma.request311.findMany({
    select: {
      service_request_id: true,
      service_name: true,
      service_name_detail: true,
      street_address: true,
      status: true,
      date_requested: true,
      date_closed: true,
      lat: true,
      lng: true,
      comm_plan_name: true,
    },
    where: {
      lat: { gte: lat - latDelta, lte: lat + latDelta },
      lng: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
    orderBy: { date_requested: 'desc' },
    take: 5000,
  });

  // Compute Haversine distance once per record, then filter
  const withDist = data
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({ ...r, _dist: haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)) }));
  const nearby = withDist.filter((r) => r._dist <= radius);

  const open = nearby.filter((r) => r.status !== 'Closed' && !r.date_closed);
  const resolved = nearby.filter((r) => r.status === 'Closed' || r.date_closed);

  const resolutionRate = nearby.length > 0 ? resolved.length / nearby.length : 0;

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

  const issueCounts: Record<string, number> = {};
  for (const r of nearby) {
    const cat = r.service_name || 'Unknown';
    issueCounts[cat] = (issueCounts[cat] || 0) + 1;
  }
  const topIssues = Object.entries(issueCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }));

  const nearbyOpenIssues = open
    .map((r) => ({
      serviceRequestId: r.service_request_id,
      serviceName: r.service_name || 'Unknown',
      serviceNameDetail: r.service_name_detail || undefined,
      streetAddress: r.street_address || undefined,
      dateRequested: r.date_requested?.toISOString() || '',
      daysOpen: r.date_requested
        ? Math.floor((Date.now() - r.date_requested.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      distanceMiles: r._dist,
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 5);

  // Nearby resources (libraries + rec centers)
  const resourceLatDelta = 5 / MILES_PER_LAT_DEG;
  const resourceLngDelta = 5 / MILES_PER_LNG_DEG;

  let nearbyResources: BlockMetrics['nearbyResources'] = [];
  try {
    const [libs, recs] = await Promise.all([
      prisma.library.findMany({
        where: {
          lat: { gte: lat - resourceLatDelta, lte: lat + resourceLatDelta },
          lng: { gte: lng - resourceLngDelta, lte: lng + resourceLngDelta },
        },
      }),
      prisma.recCenter.findMany({
        where: {
          lat: { gte: lat - resourceLatDelta, lte: lat + resourceLatDelta },
          lng: { gte: lng - resourceLngDelta, lte: lng + resourceLngDelta },
        },
      }),
    ]);

    nearbyResources = [
      ...libs.filter((l) => l.lat != null && l.lng != null).map((l) => ({
        name: l.name,
        type: 'library' as const,
        address: l.address || '',
        distanceMiles: haversineDistanceMiles(lat, lng, Number(l.lat), Number(l.lng)),
        phone: l.phone || undefined,
        website: l.website || undefined,
      })),
      ...recs.filter((r) => r.lat != null && r.lng != null).map((r) => ({
        name: r.rec_bldg || r.park_name || 'Recreation Center',
        type: 'rec_center' as const,
        address: r.address || '',
        distanceMiles: haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)),
      })),
    ]
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 5);
  } catch (err) {
    logger.error('Failed to fetch nearby resources', { error: (err as Error).message });
  }

  const nearestAddress = nearby
    .filter((r) => r.street_address)
    .sort((a, b) => a._dist - b._dist)[0]?.street_address || null;

  const communityName = (() => {
    const counts: Record<string, number> = {};
    for (const r of nearby) {
      if (r.comm_plan_name) counts[r.comm_plan_name] = (counts[r.comm_plan_name] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;
  })();

  const result: BlockMetrics = {
    totalRequests: nearby.length,
    openCount: open.length,
    resolvedCount: resolved.length,
    resolutionRate,
    avgDaysToResolve,
    topIssues,
    radiusMiles: radius,
    nearbyOpenIssues,
    nearbyResources,
    nearestAddress,
    communityName,
    truncated: data.length === 5000,
  };

  blockCacheSet(cacheKey, result);
  return result;
}
