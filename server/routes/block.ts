import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { haversineDistanceMiles, MILES_PER_LAT_DEG, MILES_PER_LNG_DEG } from '../utils/geo.js';

const router = Router();

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
      take: 5000,
    });
  } catch (err) {
    logger.error('Failed to fetch block data', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Compute Haversine distance once per record, then filter
  const withDist = data
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({ ...r, _dist: haversineDistanceMiles(lat, lng, Number(r.lat), Number(r.lng)) }));
  const nearby = withDist.filter((r) => r._dist <= radius);

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

  // Nearby open issues with details (top 5 closest)
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
  let nearbyResources: {
    name: string;
    type: 'library' | 'rec_center';
    address: string;
    distanceMiles: number;
    phone?: string;
    website?: string;
  }[] = [];

  // Use a wider bounding box for resources (5 miles) to find nearest ones
  const resourceLatDelta = 5 / MILES_PER_LAT_DEG;
  const resourceLngDelta = 5 / MILES_PER_LNG_DEG;

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

  // Nearest address from closest 311 record with a street_address
  const nearestAddress = nearby
    .filter((r) => r.street_address)
    .sort((a, b) => a._dist - b._dist)[0]?.street_address || null;

  // Community name from most common comm_plan_name
  const communityName = (() => {
    const counts: Record<string, number> = {};
    for (const r of nearby) {
      if (r.comm_plan_name) counts[r.comm_plan_name] = (counts[r.comm_plan_name] || 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;
  })();

  res.json({
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
  });
});

export default router;
