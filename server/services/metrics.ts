import { prisma } from './db.js';

export interface CommunityMetrics {
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

export interface ProcessedMetrics {
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

export async function getCommunityMetrics(communityName: string): Promise<CommunityMetrics> {
  const result = await prisma.$queryRaw<{ get_community_metrics: CommunityMetrics }[]>`
    SELECT get_community_metrics(${communityName})
  `;
  return result[0].get_community_metrics;
}

export function processMetrics(metrics: CommunityMetrics): ProcessedMetrics {
  const total = metrics.total_requests;
  const resolvedCount = metrics.resolved_count;
  const resolutionRate = total > 0 ? resolvedCount / total : 0;
  const population = metrics.population;
  const requestsPer1000Residents =
    population > 0
      ? Math.round((total / population) * 1000 * 10) / 10
      : null;

  const goodNews: string[] = [];

  if (metrics.recent_resolved_90d > 0 && metrics.top_recent_category) {
    goodNews.push(
      `${metrics.recent_resolved_90d} issues were resolved in the last 90 days. The most common fix: ${metrics.top_recent_category} (${metrics.top_recent_category_count} resolved).`
    );
  }

  if (metrics.high_res_categories.length > 0) {
    const top = metrics.high_res_categories[0];
    goodNews.push(
      `${top.category} reports are resolved ${top.resolution_rate}% of the time in this neighborhood.`
    );
  }

  if (resolutionRate >= 0.7) {
    goodNews.push(
      `The city has resolved ${Math.round(resolutionRate * 100)}% of all reported issues here — a strong track record.`
    );
  }

  if (requestsPer1000Residents !== null && requestsPer1000Residents >= 50) {
    goodNews.push(
      `Residents here are active advocates, reporting about ${requestsPer1000Residents} issues per 1,000 people — one of the higher civic engagement rates in the city.`
    );
  }

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

export async function getProcessedCommunityMetrics(communityName: string): Promise<ProcessedMetrics> {
  const metrics = await getCommunityMetrics(communityName);
  return processMetrics(metrics);
}
