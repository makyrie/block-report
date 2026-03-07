import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  // Strip SQL wildcards and enforce length
  const cleaned = community.replace(/[%_]/g, '');
  if (cleaned.length > 100 || cleaned.length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return;
  }

  const { data, error } = await supabase
    .from('requests_311')
    .select('service_name, status, date_requested, date_closed, case_age_days')
    .ilike('comm_plan_name', cleaned);

  if (error) {
    logger.error('Failed to fetch 311 data', { error: error.message, community });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // Fetch population for this community from census data
  const { data: censusData } = await supabase
    .from('census_language')
    .select('total_pop_5plus')
    .ilike('community', cleaned);

  const population = censusData
    ? censusData.reduce((sum, row) => sum + (Number(row.total_pop_5plus) || 0), 0)
    : 0;

  const total = data.length;
  const resolved = data.filter(
    (r) => r.status === 'Closed' || r.date_closed
  );
  const resolvedCount = resolved.length;
  const resolutionRate = total > 0 ? resolvedCount / total : 0;

  const daysToResolve = resolved
    .filter((r) => r.date_requested && r.date_closed)
    .map((r) => {
      const requested = new Date(r.date_requested).getTime();
      const closed = new Date(r.date_closed).getTime();
      return (closed - requested) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d >= 0);
  const avgDaysToResolve =
    daysToResolve.length > 0
      ? daysToResolve.reduce((a, b) => a + b, 0) / daysToResolve.length
      : 0;

  // Top issues by service_name
  const issueCounts: Record<string, number> = {};
  for (const r of data) {
    const cat = r.service_name || 'Unknown';
    issueCounts[cat] = (issueCounts[cat] || 0) + 1;
  }
  const topIssues = Object.entries(issueCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([category, count]) => ({ category, count }));

  // Recently resolved (last 5)
  const recentlyResolved = resolved
    .filter((r) => r.date_closed)
    .sort(
      (a, b) =>
        new Date(b.date_closed).getTime() - new Date(a.date_closed).getTime()
    )
    .slice(0, 5)
    .map((r) => ({
      category: r.service_name || 'Unknown',
      date: r.date_closed,
    }));

  const requestsPer1000Residents =
    population > 0
      ? Math.round((total / population) * 1000 * 10) / 10
      : null;

  // --- Good news detection ---
  const goodNews: string[] = [];
  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

  // 1. Recently resolved issues in last 90 days
  const recentResolved = resolved.filter((r) => {
    if (!r.date_closed) return false;
    return now - new Date(r.date_closed).getTime() < NINETY_DAYS;
  });
  if (recentResolved.length > 0) {
    // Group by category to find the top resolved category
    const recentCounts: Record<string, number> = {};
    for (const r of recentResolved) {
      const cat = r.service_name || 'Unknown';
      recentCounts[cat] = (recentCounts[cat] || 0) + 1;
    }
    const topResolved = Object.entries(recentCounts).sort(([, a], [, b]) => b - a)[0];
    goodNews.push(
      `${recentResolved.length} issues were resolved in the last 90 days. The most common fix: ${topResolved[0]} (${topResolved[1]} resolved).`
    );
  }

  // 2. Categories with high resolution rates (≥90%, minimum 10 reports)
  const categoryStats: Record<string, { total: number; resolved: number }> = {};
  for (const r of data) {
    const cat = r.service_name || 'Unknown';
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, resolved: 0 };
    categoryStats[cat].total++;
    if (r.status === 'Closed' || r.date_closed) categoryStats[cat].resolved++;
  }
  const highResCategories = Object.entries(categoryStats)
    .filter(([, s]) => s.total >= 10 && s.resolved / s.total >= 0.9)
    .sort(([, a], [, b]) => b.resolved / b.total - a.resolved / a.total);
  if (highResCategories.length > 0) {
    const [cat, stats] = highResCategories[0];
    const rate = Math.round((stats.resolved / stats.total) * 100);
    goodNews.push(
      `${cat} reports are resolved ${rate}% of the time in this neighborhood.`
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
    avgDaysToResolve: Math.round(avgDaysToResolve * 10) / 10,
    topIssues,
    recentlyResolved,
    population,
    requestsPer1000Residents,
    goodNews,
  });
});

export default router;
