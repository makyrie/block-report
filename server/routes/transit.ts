import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { logger } from '../logger.js';

const router = Router();

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

  const scores = new Map<string, TransitScore>();

  // For each community, count stops and unique agencies within its boundary
  for (const feature of geojson.features) {
    const communityName: string = feature.properties?.cpname || feature.properties?.name || '';
    if (!communityName) continue;

    const stopsInCommunity: { stop_agncy: string | null }[] = [];
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

    scores.set(communityName.toUpperCase(), {
      stopCount,
      agencyCount,
      agencies: Array.from(agencies),
      rawScore,
      transitScore: 0, // will normalize after
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
