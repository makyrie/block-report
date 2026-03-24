/**
 * Derive "good news" items from 311 metrics data.
 * Extracted from the metrics route handler for testability and reuse.
 */

interface MetricsInput {
  recent_resolved_90d: number;
  top_recent_category: string | null;
  top_recent_category_count: number;
  high_res_categories: { category: string; resolution_rate: number }[];
}

export function deriveGoodNews(
  metrics: MetricsInput,
  resolutionRate: number,
  requestsPer1000Residents: number | null,
): string[] {
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

  return goodNews;
}
