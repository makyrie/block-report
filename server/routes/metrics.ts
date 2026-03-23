import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import { validateCommunityParam } from '../utils/community.js';
import { deriveGoodNews } from '../services/good-news.js';

const router = Router();

router.get('/', async (req, res) => {
  const cleaned = validateCommunityParam(req.query.community as string | undefined);
  if (!cleaned) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

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

  let metrics: CommunityMetrics;
  try {
    const result = await prisma.$queryRaw<{ get_community_metrics: CommunityMetrics }[]>`
      SELECT get_community_metrics(${cleaned})
    `;
    metrics = result[0].get_community_metrics;
  } catch (err) {
    logger.error('Failed to fetch 311 metrics', { error: err instanceof Error ? err.message : String(err), community: cleaned });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const total = metrics.total_requests;
  const resolvedCount = metrics.resolved_count;
  const resolutionRate = total > 0 ? resolvedCount / total : 0;
  const population = metrics.population;
  const requestsPer1000Residents =
    population > 0
      ? Math.round((total / population) * 1000 * 10) / 10
      : null;

  const goodNews = deriveGoodNews(metrics, resolutionRate, requestsPer1000Residents);

  res.json({
    totalRequests311: total,
    resolvedCount,
    resolutionRate,
    avgDaysToResolve: metrics.avg_days_to_resolve,
    topIssues: metrics.top_issues,
    recentlyResolved: metrics.recently_resolved,
    population,
    requestsPer1000Residents,
    goodNews,
  });
});

export default router;
