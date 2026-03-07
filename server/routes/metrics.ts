import { Router } from 'express';
import { fetch311 } from '../services/soda.js';

const router = Router();

router.get('/', async (req, res) => {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return;
  }

  try {
    const rows = await fetch311(community);

    const totalRequests311 = rows.length;

    // Identify closed/resolved rows
    const closedRows = rows.filter(
      (row) => (row.status || '').toLowerCase() === 'closed'
    );
    const resolvedCount = closedRows.length;
    const resolutionRate =
      totalRequests311 > 0
        ? Math.round((resolvedCount / totalRequests311) * 1000) / 1000
        : 0;

    // Average days to resolve for closed cases
    let avgDaysToResolve = 0;
    if (closedRows.length > 0) {
      const totalDays = closedRows.reduce((sum, row) => {
        const days = Number(row.case_age_days) || 0;
        return sum + days;
      }, 0);
      avgDaysToResolve = Math.round((totalDays / closedRows.length) * 10) / 10;
    }

    // Top issues: group by service_name, count, sort desc, top 5
    const issueCounts: Record<string, number> = {};
    for (const row of rows) {
      const category = row.service_name || 'Unknown';
      issueCounts[category] = (issueCounts[category] || 0) + 1;
    }
    const topIssues = Object.entries(issueCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recently resolved: last 5 closed items sorted by date_closed desc
    const recentlyResolved = closedRows
      .filter((row) => row.date_closed)
      .sort((a, b) => {
        const dateA = new Date(a.date_closed || '').getTime() || 0;
        const dateB = new Date(b.date_closed || '').getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map((row) => ({
        category: row.service_name || 'Unknown',
        date: row.date_closed || '',
      }));

    const metrics = {
      totalRequests311,
      resolvedCount,
      resolutionRate,
      avgDaysToResolve,
      topIssues,
      recentlyResolved,
    };

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching 311 metrics:', error);
    res.status(500).json({ error: 'Failed to fetch 311 data' });
  }
});

export default router;
