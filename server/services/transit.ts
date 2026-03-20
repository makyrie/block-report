import { prisma } from './db.js';
import { getNeighborhoodsGeoJSON } from './communities.js';

const CITY_HALL = { lat: 32.7157, lng: -117.1611 };
const WALKING_SPEED_MPH = 3;
const BUS_SPEED_MPH = 12;
const ROUTE_INDIRECTNESS = 1.4;

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
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
    return pointInPolygon(lat, lng, (geometry.coordinates as number[][][])[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((poly) => pointInPolygon(lat, lng, poly[0]));
  }
  return false;
}

export interface TransitScore {
  stopCount: number;
  agencyCount: number;
  agencies: string[];
  rawScore: number;
  transitScore: number;
  travelTimeToCityHall: number | null;
}

const CACHE_TTL = 24 * 60 * 60 * 1000;
let scoresCache: Map<string, TransitScore> | null = null;
let scoresCachedAt = 0;

async function computeAllScores(): Promise<Map<string, TransitScore>> {
  const stops = await prisma.transitStop.findMany({
    select: { lat: true, lng: true, stop_agncy: true },
  });

  const geojson = await getNeighborhoodsGeoJSON();

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

    const stopsInCommunity: { lat: number; lng: number; stop_agncy: string | null }[] = [];
    for (const stop of stops) {
      if (stop.lat == null || stop.lng == null) continue;
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

  const maxRaw = Math.max(...Array.from(scores.values()).map((s) => s.rawScore), 1);
  for (const score of scores.values()) {
    score.transitScore = Math.round((score.rawScore / maxRaw) * 100);
  }

  return scores;
}

export async function getTransitScores(): Promise<Map<string, TransitScore>> {
  const now = Date.now();
  if (scoresCache && now - scoresCachedAt < CACHE_TTL) {
    return scoresCache;
  }
  scoresCache = await computeAllScores();
  scoresCachedAt = now;
  return scoresCache;
}

export async function getTransitScore(communityName: string): Promise<TransitScore & { cityAverage: number } | null> {
  const scores = await getTransitScores();
  const key = communityName.toUpperCase().trim();
  const score = scores.get(key);
  const cityAverage = getCityAverage(scores);

  if (!score) {
    return null;
  }

  return { ...score, cityAverage };
}

export function getCityAverage(scores: Map<string, TransitScore>): number {
  const values = Array.from(scores.values());
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, s) => sum + s.transitScore, 0) / values.length);
}
