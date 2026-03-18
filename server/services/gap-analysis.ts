import { prisma } from './db.js';
import { logger } from '../logger.js';
import { getTransitScoreValues } from './transit-scores.js';

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
let inflight: Promise<Map<string, AccessGapResult>> | null = null;

// Min-max normalize a value to 0-1. Returns 0 if bounds are equal.
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// Shared census data fetched once per computation
interface CensusRow {
  community: string | null;
  total_pop_5plus: number | null;
  english_only: number | null;
}

async function fetchCensusData(): Promise<CensusRow[]> {
  return prisma.censusLanguage.findMany({
    select: { community: true, total_pop_5plus: true, english_only: true },
  });
}

// Fetch 311 engagement rates using database-level aggregation
async function fetchEngagementRates(censusRows: CensusRow[]): Promise<Map<string, number>> {
  const grouped = await prisma.request311.groupBy({
    by: ['comm_plan_name'],
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of grouped) {
    if (!row.comm_plan_name) continue;
    const key = row.comm_plan_name.toUpperCase().trim();
    counts.set(key, (counts.get(key) || 0) + row._count._all);
  }

  const populations = new Map<string, number>();
  for (const row of censusRows) {
    if (!row.community) continue;
    const key = row.community.toUpperCase().trim();
    populations.set(key, (populations.get(key) || 0) + (Number(row.total_pop_5plus) || 0));
  }

  const rates = new Map<string, number>();
  for (const [community, pop] of populations) {
    if (pop <= 0) continue;
    const reqCount = counts.get(community) || 0;
    rates.set(community, (reqCount / pop) * 1000);
  }

  return rates;
}

// Fetch non-English speaking percentage per community
function computeNonEnglishPct(censusRows: CensusRow[]): Map<string, number> {
  const agg = new Map<string, { totalPop: number; englishOnly: number }>();
  for (const row of censusRows) {
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

// Helper to safely compute min/max without spread operator (stack-safe for large arrays)
function arrayMin(values: number[]): number {
  return values.reduce((min, v) => Math.min(min, v), Infinity);
}
function arrayMax(values: number[]): number {
  return values.reduce((max, v) => Math.max(max, v), -Infinity);
}

async function computeAllScores(): Promise<Map<string, AccessGapResult>> {
  logger.info('Computing access gap scores for all communities...');

  const censusRows = await fetchCensusData();

  // Use shared transit-scores service instead of duplicated computation
  const [engagementRates, transitScores] = await Promise.all([
    fetchEngagementRates(censusRows),
    getTransitScoreValues(),
  ]);
  const nonEnglishPcts = computeNonEnglishPct(censusRows);

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

  // Compute min/max for normalization (stack-safe reduce instead of spread)
  const engagementValues = Array.from(rawData.values())
    .map((d) => d.engagementRate)
    .filter((v): v is number => v !== null);
  const transitValues = Array.from(rawData.values())
    .map((d) => d.transitScore)
    .filter((v): v is number => v !== null);
  const nonEnglishValues = Array.from(rawData.values())
    .map((d) => d.nonEnglishPct)
    .filter((v): v is number => v !== null);

  const engMin = arrayMin(engagementValues);
  const engMax = arrayMax(engagementValues);
  const transMin = arrayMin(transitValues);
  const transMax = arrayMax(transitValues);
  const nelMin = arrayMin(nonEnglishValues);
  const nelMax = arrayMax(nonEnglishValues);

  // Weights: low engagement 0.35, low transit 0.30, high non-English 0.35
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

    if (data.engagementRate !== null) {
      const norm = normalize(data.engagementRate, engMin, engMax);
      signals.lowEngagement = Math.round((1 - norm) * 100) / 100;
      weightedSum += (1 - norm) * WEIGHT_ENGAGEMENT;
      totalWeight += WEIGHT_ENGAGEMENT;
      signalCount++;
    }

    if (data.transitScore !== null) {
      const norm = normalize(data.transitScore, transMin, transMax);
      signals.lowTransit = Math.round((1 - norm) * 100) / 100;
      weightedSum += (1 - norm) * WEIGHT_TRANSIT;
      totalWeight += WEIGHT_TRANSIT;
      signalCount++;
    }

    if (data.nonEnglishPct !== null) {
      const norm = normalize(data.nonEnglishPct, nelMin, nelMax);
      signals.highNonEnglish = Math.round(norm * 100) / 100;
      weightedSum += norm * WEIGHT_NON_ENGLISH;
      totalWeight += WEIGHT_NON_ENGLISH;
      signalCount++;
    }

    if (signalCount < 2) continue;

    const score = Math.round((weightedSum / totalWeight) * 100);
    scored.push({ community, score, signals });
  }

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

export async function getAccessGapScore(community: string): Promise<AccessGapResult | null> {
  const scores = await getAccessGapScores();
  return scores.get(community.toUpperCase().trim()) ?? null;
}

export function describeTopFactors(signals: AccessGapResult['signals']): string[] {
  const factors: string[] = [];
  if (signals.lowEngagement !== null && signals.lowEngagement > 0.5) {
    factors.push('factor.lowEngagement');
  }
  if (signals.lowTransit !== null && signals.lowTransit > 0.5) {
    factors.push('factor.lowTransit');
  }
  if (signals.highNonEnglish !== null && signals.highNonEnglish > 0.5) {
    factors.push('factor.highNonEnglish');
  }
  return factors;
}

export async function getTopUnderserved(limit = 10): Promise<
  { community: string; accessGapScore: number; signals: AccessGapResult['signals']; topFactors: string[]; rank: number; totalCommunities: number }[]
> {
  const scores = await getAccessGapScores();
  const sorted = Array.from(scores.entries())
    .sort(([, a], [, b]) => b.accessGapScore - a.accessGapScore);
  const sliced = limit === 0 ? sorted : sorted.slice(0, limit);
  return sliced.map(([community, data]) => ({
    community,
    accessGapScore: data.accessGapScore,
    signals: data.signals,
    topFactors: describeTopFactors(data.signals),
    rank: data.rank,
    totalCommunities: data.totalCommunities,
  }));
}
