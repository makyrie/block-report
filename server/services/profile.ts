import { getProcessedCommunityMetrics } from './metrics.js';
import { getTransitScore } from './transit.js';
import { getDemographicsByCommunity } from './demographics.js';
import { getAccessGapScore } from './gap-analysis.js';
import { getRecCenters, getLibraryCount } from './locations.js';
import { logger } from '../logger.js';

const PROFILE_TIMEOUT = 30_000;

export interface NeighborhoodProfile {
  community: string;
  metrics: {
    totalRequests311: number;
    resolvedCount: number;
    resolutionRate: string;
    avgDaysToResolve: number | null;
    topIssues: { category: string; count: number }[];
    goodNews: string[];
  } | null;
  transit: {
    transitScore: number;
    cityAverage: number;
    stopCount: number;
    agencies: string[];
    travelTimeToCityHall: string | null;
  } | null;
  demographics: { language: string; percentage: number }[] | null;
  accessGap: {
    score: number;
    rank: string;
    signals: Record<string, unknown>;
  } | null;
  resources: {
    recCenters: { name: string | null; address: string | null; lat: number | null; lng: number | null }[];
    libraryCount: number;
  };
}

export async function getNeighborhoodProfile(normalized: string): Promise<NeighborhoodProfile> {
  const warnOnError = <T>(name: string, p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err) => {
      logger.warn(`Profile sub-service "${name}" failed for ${normalized}`, { error: (err as Error).message });
      return fallback;
    });
  const timeout = <T>(p: Promise<T>, fallback: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      p.then((v) => { clearTimeout(timer); return v; }),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), PROFILE_TIMEOUT); }),
    ]);
  };

  const [metrics, transit, demographics, accessGap, recCenters, libraryCount] = await Promise.all([
    timeout(warnOnError('metrics', getProcessedCommunityMetrics(normalized), null), null),
    timeout(warnOnError('transit', getTransitScore(normalized), null), null),
    timeout(warnOnError('demographics', getDemographicsByCommunity(normalized), []), []),
    timeout(warnOnError('accessGap', getAccessGapScore(normalized), null), null),
    timeout(warnOnError('recCenters', getRecCenters(normalized), []), []),
    timeout(warnOnError('libraryCount', getLibraryCount(), 0), 0),
  ]);

  return {
    community: normalized,
    metrics: metrics ? {
      totalRequests311: metrics.totalRequests311,
      resolvedCount: metrics.resolvedCount,
      resolutionRate: Math.round(metrics.resolutionRate * 100) + '%',
      avgDaysToResolve: metrics.avgDaysToResolve,
      topIssues: metrics.topIssues.slice(0, 5),
      goodNews: metrics.goodNews,
    } : null,
    transit: transit ? {
      transitScore: transit.transitScore,
      cityAverage: transit.cityAverage,
      stopCount: transit.stopCount,
      agencies: transit.agencies,
      travelTimeToCityHall: transit.travelTimeToCityHall ? `~${transit.travelTimeToCityHall} min` : null,
    } : null,
    demographics: demographics.length > 0 ? demographics.slice(0, 5) : null,
    accessGap: accessGap ? {
      score: accessGap.accessGapScore,
      rank: `${accessGap.rank} of ${accessGap.totalCommunities}`,
      signals: accessGap.signals,
    } : null,
    resources: {
      recCenters: recCenters.slice(0, 5).map((r: { park_name: string | null; address: string | null; lat: number | null; lng: number | null }) => ({
        name: r.park_name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
      })),
      libraryCount: libraryCount,
    },
  };
}
