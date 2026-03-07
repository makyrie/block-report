import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  const { data, error } = await supabase
    .from('requests_311')
    .select('*')
    .ilike('comm_plan_name', community);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

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

  res.json({
    totalRequests311: total,
    resolvedCount,
    resolutionRate,
    avgDaysToResolve: Math.round(avgDaysToResolve * 10) / 10,
    topIssues,
    recentlyResolved,
  });
});

export default router;
