import { haversineDistanceMiles } from '../utils/geo.js';
import { prisma } from './db.js';
import { logger } from '../logger.js';

// 1 degree of latitude ~ 69 miles; longitude varies by latitude
const MILES_PER_LAT_DEG = 69;
// At San Diego (~32.7°N): 1 deg longitude ~ 58.8 miles
const MILES_PER_LNG_DEG = 58.8;

const BLOCK_QUERY_LIMIT = 5000;

/** Fetch raw 311 requests within a bounding box around the given coordinates */
export async function fetchBlockRequests(lat: number, lng: number, radius: number): Promise<RawRequest[]> {
  const latDelta = radius / MILES_PER_LAT_DEG;
  const lngDelta = radius / MILES_PER_LNG_DEG;
  const data = await prisma.request311.findMany({
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
  return data;
}

interface RawRequest {
  service_name: string | null;
  status: string | null;
  date_requested: Date | null;
  date_closed: Date | null;
  lat: unknown;
  lng: unknown;
}

export interface BlockResult {
  totalRequests: number;
  openCount: number;
  resolvedCount: number;
  resolutionRate: number;
  avgDaysToResolve: number | null;
  topIssues: { category: string; count: number }[];
  recentlyResolved: { category: string; date: string }[];
  radiusMiles: number;
}

export function computeBlockMetrics(
  data: RawRequest[],
  lat: number,
  lng: number,
  radius: number,
): BlockResult {
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

  return {
    totalRequests: nearby.length,
    openCount: open.length,
    resolvedCount: resolved.length,
    resolutionRate,
    avgDaysToResolve,
    topIssues,
    recentlyResolved,
    radiusMiles: radius,
  };
}
