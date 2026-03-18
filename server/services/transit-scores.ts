// Single source of truth for transit score computation across all communities

import { prisma } from './db.js';
import { logger } from '../logger.js';
import { fetchBoundaries } from './boundaries.js';
import { pointInFeature, computeBBox, pointInBBox, haversineDistanceMiles, computeCentroid } from '../utils/geo.js';

const CITY_HALL = { lat: 32.7157, lng: -117.1611 };
const WALKING_SPEED_MPH = 3;
const BUS_SPEED_MPH = 12;
const ROUTE_INDIRECTNESS = 1.4;

const CACHE_TTL = 24 * 60 * 60 * 1000;

export interface TransitScore {
  stopCount: number;
  agencyCount: number;
  agencies: string[];
  rawScore: number;
  transitScore: number; // normalized 0-100
  travelTimeToCityHall: number | null;
}

let scoresCache: Map<string, TransitScore> | null = null;
let scoresCachedAt = 0;
let inflight: Promise<Map<string, TransitScore>> | null = null;

async function computeAllScores(): Promise<Map<string, TransitScore>> {
  logger.info('Computing transit scores for all communities...');

  const stops = await prisma.transitStop.findMany({
    select: { lat: true, lng: true, stop_agncy: true },
  });

  const geojson = await fetchBoundaries();

  // Pre-compute nearest stop to City Hall
  let nearestToCityHall: { lat: number; lng: number } | null = null;
  let minDistCityHall = Infinity;
  for (const stop of stops) {
    if (stop.lat == null || stop.lng == null) continue;
    const d = haversineDistanceMiles(CITY_HALL.lat, CITY_HALL.lng, stop.lat, stop.lng);
    if (d < minDistCityHall) {
      minDistCityHall = d;
      nearestToCityHall = { lat: stop.lat, lng: stop.lng };
    }
  }

  const scores = new Map<string, TransitScore>();

  for (const feature of geojson.features) {
    const communityName: string = feature.properties?.cpname || feature.properties?.name || '';
    if (!communityName) continue;

    // Use bbox pre-filtering for performance
    const bbox = computeBBox(feature.geometry);

    const stopsInCommunity: { lat: number; lng: number; stop_agncy: string | null }[] = [];
    for (const stop of stops) {
      if (stop.lat == null || stop.lng == null) continue;
      if (!pointInBBox(stop.lat, stop.lng, bbox)) continue;
      if (pointInFeature(stop.lat, stop.lng, feature.geometry)) {
        stopsInCommunity.push({ lat: stop.lat, lng: stop.lng, stop_agncy: stop.stop_agncy });
      }
    }

    const agencies = new Set<string>();
    for (const s of stopsInCommunity) {
      if (s.stop_agncy) agencies.add(s.stop_agncy);
    }

    const stopCount = stopsInCommunity.length;
    const agencyCount = agencies.size;
    const rawScore = stopCount * 0.4 + agencyCount * 10 * 0.6;

    // Estimate travel time to City Hall
    const centroid = computeCentroid(feature.geometry);
    let travelTimeToCityHall: number | null = null;

    if (centroid && stopsInCommunity.length > 0 && nearestToCityHall) {
      let nearestToCentroid = stopsInCommunity[0];
      let minDistCentroid = Infinity;
      for (const stop of stopsInCommunity) {
        const d = haversineDistanceMiles(centroid.lat, centroid.lng, stop.lat, stop.lng);
        if (d < minDistCentroid) {
          minDistCentroid = d;
          nearestToCentroid = stop;
        }
      }

      const walkToStop = (minDistCentroid / WALKING_SPEED_MPH) * 60;
      const transitDist = haversineDistanceMiles(
        nearestToCentroid.lat, nearestToCentroid.lng,
        nearestToCityHall.lat, nearestToCityHall.lng
      );
      const transitTime = ((transitDist * ROUTE_INDIRECTNESS) / BUS_SPEED_MPH) * 60;
      const walkFromStop = (minDistCityHall / WALKING_SPEED_MPH) * 60;

      travelTimeToCityHall = Math.round(walkToStop + transitTime + walkFromStop);
    }

    scores.set(communityName.toUpperCase(), {
      stopCount,
      agencyCount,
      agencies: Array.from(agencies),
      rawScore,
      transitScore: 0,
      travelTimeToCityHall,
    });
  }

  // Normalize to 0-100
  const values = Array.from(scores.values());
  const maxRaw = values.reduce((max, s) => Math.max(max, s.rawScore), 1);
  for (const score of values) {
    score.transitScore = Math.round((score.rawScore / maxRaw) * 100);
  }

  logger.info(`Computed transit scores for ${scores.size} communities`);
  return scores;
}

export async function getTransitScores(): Promise<Map<string, TransitScore>> {
  const now = Date.now();
  if (scoresCache && now - scoresCachedAt < CACHE_TTL) {
    return scoresCache;
  }
  // Promise coalescing: reuse in-flight computation for concurrent callers
  if (!inflight) {
    inflight = computeAllScores().then((result) => {
      scoresCache = result;
      scoresCachedAt = Date.now();
      inflight = null;
      return result;
    }).catch((err) => {
      inflight = null;
      throw err;
    });
  }
  return inflight;
}

export function getCityAverage(scores: Map<string, TransitScore>): number {
  const values = Array.from(scores.values());
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, s) => sum + s.transitScore, 0) / values.length);
}

// Get just the normalized 0-100 scores (used by gap-analysis)
export async function getTransitScoreValues(): Promise<Map<string, number>> {
  const scores = await getTransitScores();
  const result = new Map<string, number>();
  for (const [key, val] of scores) {
    result.set(key, val.transitScore);
  }
  return result;
}
