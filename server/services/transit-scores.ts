// Single source of truth for transit score computation across all communities

import { join } from 'node:path';
import { prisma } from './db.js';
import { logger } from '../logger.js';
import { fetchBoundaries } from './boundaries.js';
import { pointInFeature, computeBBox, pointInBBox, haversineDistanceMiles, computeCentroid } from '../utils/geo.js';
import { createCachedComputation } from '../utils/cached-computation.js';

const CITY_HALL = { lat: 32.7157, lng: -117.1611 };
const WALKING_SPEED_MPH = 3;
const BUS_SPEED_MPH = 12;
const ROUTE_INDIRECTNESS = 1.4;

// Spatial grid for O(communities * local_stops) instead of O(communities * all_stops)
const GRID_CELL_SIZE = 0.02; // ~2 km cells

interface GridStop {
  lat: number;
  lng: number;
  stop_agncy: string | null;
}

function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_CELL_SIZE)},${Math.floor(lng / GRID_CELL_SIZE)}`;
}

function buildSpatialGrid(stops: GridStop[]): Map<string, GridStop[]> {
  const grid = new Map<string, GridStop[]>();
  for (const stop of stops) {
    if (stop.lat == null || stop.lng == null) continue;
    const key = gridKey(stop.lat, stop.lng);
    const cell = grid.get(key);
    if (cell) cell.push(stop);
    else grid.set(key, [stop]);
  }
  return grid;
}

function getStopsInBBox(
  grid: Map<string, GridStop[]>,
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): GridStop[] {
  const result: GridStop[] = [];
  const minRow = Math.floor(bbox.minLat / GRID_CELL_SIZE);
  const maxRow = Math.floor(bbox.maxLat / GRID_CELL_SIZE);
  const minCol = Math.floor(bbox.minLng / GRID_CELL_SIZE);
  const maxCol = Math.floor(bbox.maxLng / GRID_CELL_SIZE);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = grid.get(`${row},${col}`);
      if (cell) result.push(...cell);
    }
  }
  return result;
}

export interface TransitScore {
  stopCount: number;
  agencyCount: number;
  agencies: string[];
  rawScore: number;
  transitScore: number; // normalized 0-100
  travelTimeToCityHall: number | null;
}

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

  // Build spatial grid for efficient stop lookups
  const spatialGrid = buildSpatialGrid(
    stops.filter((s) => s.lat != null && s.lng != null) as GridStop[]
  );

  const scores = new Map<string, TransitScore>();

  for (const feature of geojson.features) {
    const communityName: string = feature.properties?.cpname || feature.properties?.name || '';
    if (!communityName) continue;

    // Use spatial grid + bbox to narrow candidate stops
    const bbox = computeBBox(feature.geometry);
    const candidates = getStopsInBBox(spatialGrid, bbox);

    const stopsInCommunity: GridStop[] = [];
    for (const stop of candidates) {
      if (!pointInBBox(stop.lat, stop.lng, bbox)) continue;
      if (pointInFeature(stop.lat, stop.lng, feature.geometry)) {
        stopsInCommunity.push(stop);
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

const CACHE_TTL = 24 * 60 * 60 * 1000;
const DISK_CACHE_PATH = join(process.cwd(), 'server', 'cache', 'transit-scores.json');
const cachedScores = createCachedComputation(computeAllScores, CACHE_TTL, { diskCachePath: DISK_CACHE_PATH });

export function getTransitScores(): Promise<Map<string, TransitScore>> {
  return cachedScores.get();
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
