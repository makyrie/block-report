import { prisma } from './db.js';
import { deriveGoodNews } from './good-news.js';

interface CommunityMetrics {
  total_requests: number;
  resolved_count: number;
  avg_days_to_resolve: number;
  top_issues: { category: string; count: number }[];
  recently_resolved: { category: string; date: string }[];
  recent_resolved_90d: number;
  top_recent_category: string | null;
  top_recent_category_count: number;
  high_res_categories: { category: string; total: number; resolved: number; resolution_rate: number }[];
  population: number;
}

export interface CommunityMetricsResult {
  totalRequests311: number;
  resolvedCount: number;
  resolutionRate: number;
  avgDaysToResolve: number;
  topIssues: { category: string; count: number }[];
  recentlyResolved: { category: string; date: string }[];
  population: number;
  requestsPer1000Residents: number | null;
  goodNews: string[];
}

/** Fetch raw community metrics from the database via the stored function */
export async function fetchCommunityMetrics(community: string): Promise<CommunityMetrics> {
  const result = await prisma.$queryRaw<{ get_community_metrics: CommunityMetrics }[]>`
    SELECT get_community_metrics(${community})
  `;
  return result[0].get_community_metrics;
}

/** Transform raw DB metrics into the API response shape */
export function buildCommunityMetricsResponse(metrics: CommunityMetrics): CommunityMetricsResult {
  const total = metrics.total_requests;
  const resolvedCount = metrics.resolved_count;
  const resolutionRate = total > 0 ? resolvedCount / total : 0;
  const population = metrics.population;
  const requestsPer1000Residents =
    population > 0
      ? Math.round((total / population) * 1000 * 10) / 10
      : null;

  const goodNews = deriveGoodNews(metrics, resolutionRate, requestsPer1000Residents);

  return {
    totalRequests311: total,
    resolvedCount,
    resolutionRate,
    avgDaysToResolve: metrics.avg_days_to_resolve,
    topIssues: metrics.top_issues,
    recentlyResolved: metrics.recently_resolved,
    population,
    requestsPer1000Residents,
    goodNews,
  };
}
