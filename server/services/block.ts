import { haversineDistanceMiles } from '../utils/geo.js';

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
