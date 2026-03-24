import { Router } from 'express';
import { prisma } from '../services/db.js';
import { logger } from '../logger.js';
import type { CommunityTrends } from '../../src/types/index.js';
import { validateCommunityParam } from '../utils/community.js';
import { validateCommunity } from '../utils/validation.js';

const router = Router();

// In-memory cache for trends data (24h TTL, keyed by community name)
const TRENDS_TTL = 24 * 60 * 60 * 1000;
const TRENDS_MAX_SIZE = 100;
const TRENDS_SWEEP_INTERVAL = 60 * 60 * 1000; // sweep every hour
const trendsCache = new Map<string, { data: CommunityTrends; cachedAt: number }>();

// Periodic sweep to evict stale entries proactively
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of trendsCache) {
    if (now - entry.cachedAt >= TRENDS_TTL) {
      trendsCache.delete(key);
    }
  }
}, TRENDS_SWEEP_INTERVAL).unref();

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

  // --- Good news detection ---
  const goodNews: string[] = [];

  // 1. Recently resolved issues in last 90 days
  if (metrics.recent_resolved_90d > 0 && metrics.top_recent_category) {
    goodNews.push(
      `${metrics.recent_resolved_90d} issues were resolved in the last 90 days. The most common fix: ${metrics.top_recent_category} (${metrics.top_recent_category_count} resolved).`
    );
  }

  // 2. Categories with high resolution rates (>=90%, minimum 10 reports)
  if (metrics.high_res_categories.length > 0) {
    const top = metrics.high_res_categories[0];
    goodNews.push(
      `${top.category} reports are resolved ${top.resolution_rate}% of the time in this neighborhood.`
    );
  }

  // 3. Overall resolution rate is strong
  if (resolutionRate >= 0.7) {
    goodNews.push(
      `The city has resolved ${Math.round(resolutionRate * 100)}% of all reported issues here — a strong track record.`
    );
  }

  // 4. Active engagement as a positive signal
  if (requestsPer1000Residents !== null && requestsPer1000Residents >= 50) {
    goodNews.push(
      `Residents here are active advocates, reporting about ${requestsPer1000Residents} issues per 1,000 people — one of the higher civic engagement rates in the city.`
    );
  }

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

router.get('/trends', async (req, res) => {
  const cleaned = validateCommunity(req, res);
  if (!cleaned) return;

  try {
    const cacheKey = cleaned.toLowerCase();
    const cached = trendsCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.cachedAt < TRENDS_TTL) {
        res.json(cached.data);
        return;
      }
      // Evict stale entry
      trendsCache.delete(cacheKey);
    }

    const result = await prisma.$queryRaw<{ get_community_trends: CommunityTrends }[]>`
      SELECT get_community_trends(${cleaned})
    `;
    const row = result[0];
    if (!row?.get_community_trends) {
      logger.error('get_community_trends returned no data', { community: cleaned });
      res.status(404).json({ error: 'No trend data available for this community' });
      return;
    }
    const data = row.get_community_trends;
    // Evict oldest entry if at max size
    if (trendsCache.size >= TRENDS_MAX_SIZE) {
      const oldestKey = trendsCache.keys().next().value;
      if (oldestKey !== undefined) trendsCache.delete(oldestKey);
    }
    trendsCache.set(cacheKey, { data, cachedAt: Date.now() });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch 311 trends', { error: err instanceof Error ? err.message : String(err), community: cleaned });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
