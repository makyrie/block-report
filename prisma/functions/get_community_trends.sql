-- RPC function to aggregate 311 trend data for a community over the trailing 12 months.
-- This runs as raw SQL via prisma.$queryRaw since Prisma doesn't manage functions.
-- To apply: run this SQL directly against your Neon database.

-- Composite index for efficient time-series queries by community
CREATE INDEX IF NOT EXISTS idx_311_comm_plan_date
ON requests_311 (LOWER(comm_plan_name), date_requested);

CREATE OR REPLACE FUNCTION get_community_trends(community_name TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  current_month TIMESTAMPTZ := date_trunc('month', NOW());
BEGIN

  WITH monthly_data AS (
    SELECT
      date_trunc('month', date_requested) AS month,
      to_char(date_trunc('month', date_requested), 'YYYY-MM') AS period,
      COUNT(*) AS "totalRequests",
      COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL) AS "resolvedCount",
      ROUND(
        COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
        / NULLIF(COUNT(*), 0)::numeric, 3
      ) AS "resolutionRate"
    FROM requests_311
    WHERE LOWER(comm_plan_name) = LOWER(community_name)
      AND date_requested >= current_month - INTERVAL '12 months'
      AND date_requested < current_month
    GROUP BY date_trunc('month', date_requested)
  ),
  halves AS (
    SELECT
      ROUND(
        SUM("resolvedCount") FILTER (WHERE month >= current_month - INTERVAL '6 months')::numeric
        / NULLIF(SUM("totalRequests") FILTER (WHERE month >= current_month - INTERVAL '6 months'), 0)::numeric
      , 3) AS curr_rate,
      COALESCE(SUM("totalRequests") FILTER (WHERE month >= current_month - INTERVAL '6 months'), 0) AS curr_vol,
      ROUND(
        SUM("resolvedCount") FILTER (WHERE month < current_month - INTERVAL '6 months')::numeric
        / NULLIF(SUM("totalRequests") FILTER (WHERE month < current_month - INTERVAL '6 months'), 0)::numeric
      , 3) AS prev_rate,
      COALESCE(SUM("totalRequests") FILTER (WHERE month < current_month - INTERVAL '6 months'), 0) AS prev_vol
    FROM monthly_data
  )
  SELECT jsonb_build_object(
    'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'period', period,
      'totalRequests', "totalRequests",
      'resolvedCount', "resolvedCount",
      'resolutionRate', "resolutionRate"
    ) ORDER BY month) FROM monthly_data), '[]'::jsonb),
    'summary', jsonb_build_object(
      'currentResolutionRate', COALESCE(h.curr_rate, 0),
      'previousResolutionRate', COALESCE(h.prev_rate, 0),
      'direction', CASE
        WHEN h.curr_rate IS NULL AND h.prev_rate IS NULL THEN 'stable'
        WHEN h.prev_rate IS NULL THEN 'improving'
        WHEN h.curr_rate IS NULL THEN 'declining'
        WHEN h.curr_rate > h.prev_rate + 0.05 THEN 'improving'
        WHEN h.curr_rate < h.prev_rate - 0.05 THEN 'declining'
        ELSE 'stable'
      END,
      'volumeChange', CASE
        WHEN h.prev_vol > 0 THEN ROUND(((h.curr_vol - h.prev_vol)::numeric / h.prev_vol::numeric) * 100)
        ELSE 0
      END,
      'volumeDirection', CASE
        WHEN h.prev_vol IS NULL OR h.prev_vol = 0 THEN
          CASE WHEN COALESCE(h.curr_vol, 0) > 0 THEN 'declining' ELSE 'stable' END
        WHEN ((h.curr_vol - h.prev_vol)::numeric / h.prev_vol::numeric) * 100 > 10 THEN 'declining'
        WHEN ((h.curr_vol - h.prev_vol)::numeric / h.prev_vol::numeric) * 100 < -10 THEN 'improving'
        ELSE 'stable'
      END
    )
  ) INTO result
  FROM halves h;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
