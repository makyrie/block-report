import { prisma } from './db.js';
import { logger } from '../logger.js';

export interface AccessGapResult {
  accessGapScore: number;
  signals: {
    lowEngagement: number | null;
    lowTransit: number | null;
    highNonEnglish: number | null;
  };
  rank: number;
  totalCommunities: number;
}

interface CommunityRawData {
  engagementRate: number | null; // requests per 1,000 residents
  transitScore: number | null;  // 0-100
  nonEnglishPct: number | null; // 0-1
}

const CACHE_TTL = 24 * 60 * 60 * 1000;
let scoresCache: Map<string, AccessGapResult> | null = null;
let scoresCachedAt = 0;

// Min-max normalize a value to 0-1. Returns null if bounds are equal.
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// Fetch 311 engagement rates for all communities from the requests_311 table
async function fetchEngagementRates(): Promise<Map<string, number>> {
  const requests = await prisma.request311.findMany({
    select: { comm_plan_name: true },
  });

  // Count requests per community (normalize names to uppercase)
  const counts = new Map<string, number>();
  for (const r of requests) {
    if (!r.comm_plan_name) continue;
    const key = r.comm_plan_name.toUpperCase().trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Fetch population per community from census data
  const censusRows = await prisma.censusLanguage.findMany({
    select: { community: true, total_pop_5plus: true },
  });

  const populations = new Map<string, number>();
  for (const row of censusRows) {
    if (!row.community) continue;
    const key = row.community.toUpperCase().trim();
    populations.set(key, (populations.get(key) || 0) + (Number(row.total_pop_5plus) || 0));
  }

  // Compute per-1000 rate for communities that have both data points
  const rates = new Map<string, number>();
  for (const [community, pop] of populations) {
    if (pop <= 0) continue;
    const reqCount = counts.get(community) || 0;
    rates.set(community, (reqCount / pop) * 1000);
  }

  return rates;
}

// Fetch transit scores for all communities
async function fetchTransitScores(): Promise<Map<string, number>> {
  const stops = await prisma.transitStop.findMany({
    select: { lat: true, lng: true, stop_agncy: true },
  });

  const boundaryRes = await fetch(
    'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson'
  );
  if (!boundaryRes.ok) throw new Error(`Failed to fetch boundaries: ${boundaryRes.status}`);
  const geojson = await boundaryRes.json();

  const scores = new Map<string, number>();

  for (const feature of geojson.features) {
    const name: string = feature.properties?.cpname || feature.properties?.name || '';
    if (!name) continue;

    let stopCount = 0;
    const agencies = new Set<string>();

    for (const stop of stops) {
      if (stop.lat == null || stop.lng == null) continue;
      if (pointInFeature(stop.lat, stop.lng, feature.geometry)) {
        stopCount++;
        if (stop.stop_agncy) agencies.add(stop.stop_agncy);
      }
    }

    const rawScore = stopCount * 0.4 + agencies.size * 10 * 0.6;
    scores.set(name.toUpperCase(), rawScore);
  }

  // Normalize to 0-100
  const maxRaw = Math.max(...Array.from(scores.values()), 1);
  for (const [key, raw] of scores) {
    scores.set(key, Math.round((raw / maxRaw) * 100));
  }

  return scores;
}

// Fetch non-English speaking percentage per community
async function fetchNonEnglishPct(): Promise<Map<string, number>> {
  const data = await prisma.censusLanguage.findMany({
    select: { community: true, total_pop_5plus: true, english_only: true },
  });

  // Aggregate by community
  const agg = new Map<string, { totalPop: number; englishOnly: number }>();
  for (const row of data) {
    if (!row.community) continue;
    const key = row.community.toUpperCase().trim();
    const existing = agg.get(key) || { totalPop: 0, englishOnly: 0 };
    existing.totalPop += Number(row.total_pop_5plus) || 0;
    existing.englishOnly += Number(row.english_only) || 0;
    agg.set(key, existing);
  }

  const pcts = new Map<string, number>();
  for (const [community, stats] of agg) {
    if (stats.totalPop <= 0) continue;
    pcts.set(community, 1 - stats.englishOnly / stats.totalPop);
  }

  return pcts;
}

// Point-in-polygon (ray casting) — same algorithm as transit.ts
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

function pointInFeature(
  lat: number,
  lng: number,
  geometry: { type: string; coordinates: number[][][] | number[][][][] },
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, (geometry.coordinates as number[][][])[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((poly) =>
      pointInPolygon(lat, lng, poly[0]),
    );
  }
  return false;
}

async function computeAllScores(): Promise<Map<string, AccessGapResult>> {
  logger.info('Computing access gap scores for all communities...');

  const [engagementRates, transitScores, nonEnglishPcts] = await Promise.all([
    fetchEngagementRates(),
    fetchTransitScores(),
    fetchNonEnglishPct(),
  ]);

  // Collect all known communities
  const allCommunities = new Set<string>();
  for (const key of engagementRates.keys()) allCommunities.add(key);
  for (const key of transitScores.keys()) allCommunities.add(key);
  for (const key of nonEnglishPcts.keys()) allCommunities.add(key);

  // Build raw data per community
  const rawData = new Map<string, CommunityRawData>();
  for (const community of allCommunities) {
    rawData.set(community, {
      engagementRate: engagementRates.get(community) ?? null,
      transitScore: transitScores.get(community) ?? null,
      nonEnglishPct: nonEnglishPcts.get(community) ?? null,
    });
  }

  // Compute min/max for normalization (only across communities with data)
  const engagementValues = Array.from(rawData.values())
    .map((d) => d.engagementRate)
    .filter((v): v is number => v !== null);
  const transitValues = Array.from(rawData.values())
    .map((d) => d.transitScore)
    .filter((v): v is number => v !== null);
  const nonEnglishValues = Array.from(rawData.values())
    .map((d) => d.nonEnglishPct)
    .filter((v): v is number => v !== null);

  const engMin = Math.min(...engagementValues);
  const engMax = Math.max(...engagementValues);
  const transMin = Math.min(...transitValues);
  const transMax = Math.max(...transitValues);
  const nelMin = Math.min(...nonEnglishValues);
  const nelMax = Math.max(...nonEnglishValues);

  // Compute composite scores
  // Weights: low engagement 0.35, low transit 0.30, high non-English 0.35
  // (Adjusted from issue spec since we only have 3 signals, not 5)
  const WEIGHT_ENGAGEMENT = 0.35;
  const WEIGHT_TRANSIT = 0.30;
  const WEIGHT_NON_ENGLISH = 0.35;

  const scored: { community: string; score: number; signals: AccessGapResult['signals'] }[] = [];

  for (const [community, data] of rawData) {
    let signalCount = 0;
    let weightedSum = 0;
    let totalWeight = 0;

    const signals: AccessGapResult['signals'] = {
      lowEngagement: null,
      lowTransit: null,
      highNonEnglish: null,
    };

    // Low 311 engagement → higher gap score
    if (data.engagementRate !== null) {
      const norm = normalize(data.engagementRate, engMin, engMax);
      signals.lowEngagement = Math.round((1 - norm) * 100) / 100;
      weightedSum += (1 - norm) * WEIGHT_ENGAGEMENT;
      totalWeight += WEIGHT_ENGAGEMENT;
      signalCount++;
    }

    // Low transit score → higher gap score
    if (data.transitScore !== null) {
      const norm = normalize(data.transitScore, transMin, transMax);
      signals.lowTransit = Math.round((1 - norm) * 100) / 100;
      weightedSum += (1 - norm) * WEIGHT_TRANSIT;
      totalWeight += WEIGHT_TRANSIT;
      signalCount++;
    }

    // High non-English percentage → higher gap score
    if (data.nonEnglishPct !== null) {
      const norm = normalize(data.nonEnglishPct, nelMin, nelMax);
      signals.highNonEnglish = Math.round(norm * 100) / 100;
      weightedSum += norm * WEIGHT_NON_ENGLISH;
      totalWeight += WEIGHT_NON_ENGLISH;
      signalCount++;
    }

    // Need at least 2 signals for a meaningful score
    if (signalCount < 2) continue;

    // Normalize by total weight used (handles missing signals gracefully)
    const score = Math.round((weightedSum / totalWeight) * 100);
    scored.push({ community, score, signals });
  }

  // Sort by score descending to assign ranks
  scored.sort((a, b) => b.score - a.score);

  const results = new Map<string, AccessGapResult>();
  for (let i = 0; i < scored.length; i++) {
    const { community, score, signals } = scored[i];
    results.set(community, {
      accessGapScore: score,
      signals,
      rank: i + 1,
      totalCommunities: scored.length,
    });
  }

  logger.info(`Computed access gap scores for ${results.size} communities`);
  return results;
}

export async function getAccessGapScores(): Promise<Map<string, AccessGapResult>> {
  const now = Date.now();
  if (scoresCache && now - scoresCachedAt < CACHE_TTL) {
    return scoresCache;
  }
  scoresCache = await computeAllScores();
  scoresCachedAt = now;
  return scoresCache;
}

export async function getAccessGapScore(community: string): Promise<AccessGapResult | null> {
  const scores = await getAccessGapScores();
  return scores.get(community.toUpperCase().trim()) ?? null;
}

export async function getTopUnderserved(limit = 10): Promise<
  { community: string; accessGapScore: number; signals: AccessGapResult['signals'] }[]
> {
  const scores = await getAccessGapScores();
  return Array.from(scores.entries())
    .sort(([, a], [, b]) => b.accessGapScore - a.accessGapScore)
    .slice(0, limit)
    .map(([community, data]) => ({
      community,
      accessGapScore: data.accessGapScore,
      signals: data.signals,
    }));
}
