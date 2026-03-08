import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { logger } from '../logger.js';

const router = Router();

const CITY_HALL = { lat: 32.7157, lng: -117.1611 };
const WALKING_SPEED_MPH = 3;
const BUS_SPEED_MPH = 12;
const ROUTE_INDIRECTNESS = 1.4;

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeCentroid(geometry: { type: string; coordinates: number[][][] | number[][][][] }): { lat: number; lng: number } | null {
  let ring: number[][] = [];
  if (geometry.type === 'Polygon') {
    ring = (geometry.coordinates as number[][][])[0];
  } else if (geometry.type === 'MultiPolygon') {
    let maxLen = 0;
    for (const poly of geometry.coordinates as number[][][][]) {
      if (poly[0].length > maxLen) {
        maxLen = poly[0].length;
        ring = poly[0];
      }
    }
  }
  if (ring.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  for (const [lng, lat] of ring) {
    latSum += lat;
    lngSum += lng;
  }
  return { lat: latSum / ring.length, lng: lngSum / ring.length };
}

// Cache the computed transit scores for all communities (recompute every 24h)
const CACHE_TTL = 24 * 60 * 60 * 1000;
let scoresCache: Map<string, TransitScore> | null = null;
let scoresCachedAt = 0;

interface TransitScore {
  stopCount: number;
  agencyCount: number;
  agencies: string[];
  rawScore: number;
  transitScore: number; // normalized 0-100
  travelTimeToCityHall: number | null; // estimated minutes via transit
}

// Simple point-in-polygon (ray casting)
function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInFeature(lat: number, lng: number, geometry: { type: string; coordinates: number[][][] | number[][][][] }): boolean {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    return pointInPolygon(lat, lng, coords[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][];
    return coords.some((poly) => pointInPolygon(lat, lng, poly[0]));
  }
  return false;
}

const NEIGHBORHOODS_URL =
  'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';

async function computeAllScores(): Promise<Map<string, TransitScore>> {
  // Fetch all transit stops with location and agency data
  const { data: stops, error } = await supabase
    .from('transit_stops')
    .select('lat, lng, stop_agncy');

  if (error) throw new Error(`Failed to fetch transit stops: ${error.message}`);

  // Fetch community boundaries
  const response = await fetch(NEIGHBORHOODS_URL);
  if (!response.ok) throw new Error(`Failed to fetch boundaries: ${response.status}`);
  const geojson = await response.json();

  // Pre-compute nearest stop to City Hall (used for all communities)
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

  // For each community, count stops and unique agencies within its boundary
  for (const feature of geojson.features) {
    const communityName: string = feature.properties?.cpname || feature.properties?.name || '';
    if (!communityName) continue;

    const stopsInCommunity: { lat: number; lng: number; stop_agncy: string | null }[] = [];
    for (const stop of stops) {
      if (stop.lat == null || stop.lng == null) continue;
      // GeoJSON coordinates are [lng, lat]
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
    // Composite: stops * 0.4 + routes(agencies) * 0.6
    // Agency count is small (typically 1-3), so scale it up to be comparable with stop count
    const rawScore = stopCount * 0.4 + agencyCount * 10 * 0.6;

    // Estimate travel time to City Hall
    const centroid = computeCentroid(feature.geometry);
    let travelTimeToCityHall: number | null = null;

    if (centroid && stopsInCommunity.length > 0 && nearestToCityHall) {
      // Find nearest stop to community centroid
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
      transitScore: 0, // will normalize after
      travelTimeToCityHall,
    });
  }

  // Normalize to 0-100
  const maxRaw = Math.max(...Array.from(scores.values()).map((s) => s.rawScore), 1);
  for (const score of scores.values()) {
    score.transitScore = Math.round((score.rawScore / maxRaw) * 100);
  }

  return scores;
}

async function getScores(): Promise<Map<string, TransitScore>> {
  const now = Date.now();
  if (scoresCache && now - scoresCachedAt < CACHE_TTL) {
    return scoresCache;
  }
  scoresCache = await computeAllScores();
  scoresCachedAt = now;
  return scoresCache;
}

router.get('/', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  const cleaned = community.replace(/[%_]/g, '');
  if (cleaned.length > 100 || cleaned.length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return;
  }

  try {
    const scores = await getScores();
    const key = cleaned.toUpperCase();
    const score = scores.get(key);

    if (!score) {
      // Return zeroed score for unknown communities
      res.json({
        stopCount: 0,
        agencyCount: 0,
        agencies: [],
        transitScore: 0,
        cityAverage: getCityAverage(scores),
        travelTimeToCityHall: null,
      });
      return;
    }

    res.json({
      ...score,
      cityAverage: getCityAverage(scores),
    });
  } catch (err) {
    logger.error('Failed to compute transit scores', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getCityAverage(scores: Map<string, TransitScore>): number {
  const values = Array.from(scores.values());
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, s) => sum + s.transitScore, 0) / values.length);
}

export default router;
