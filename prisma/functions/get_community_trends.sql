-- RPC function to aggregate 311 trend data for a community over the trailing 12 months.
-- This runs as raw SQL via prisma.$queryRaw since Prisma doesn't manage functions.
-- To apply: run this SQL directly against your Neon database.

-- Composite index for efficient time-series queries by community
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_311_comm_plan_date
ON requests_311 (LOWER(comm_plan_name), date_requested);

CREATE OR REPLACE FUNCTION get_community_trends(community_name TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  cleaned TEXT;
BEGIN
  cleaned := replace(replace(community_name, '%', ''), '_', '');

  SELECT jsonb_build_object(
    'monthly', COALESCE(monthly.items, '[]'::jsonb),
    'summary', jsonb_build_object(
      'currentResolutionRate', COALESCE(curr.rate, 0),
      'previousResolutionRate', COALESCE(prev.rate, 0),
      'direction', CASE
        WHEN curr.rate > prev.rate + 0.05 THEN 'improving'
        WHEN curr.rate < prev.rate - 0.05 THEN 'declining'
        ELSE 'stable'
      END,
      'volumeChange', CASE
        WHEN prev.vol > 0 THEN ROUND(((curr.vol - prev.vol)::numeric / prev.vol::numeric) * 100)
        ELSE 0
      END
    )
  ) INTO result
  FROM
    -- Monthly aggregation for trailing 12 complete months
    LATERAL (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.period) AS items FROM (
        SELECT
          to_char(date_trunc('month', date_requested), 'YYYY-MM') AS period,
          COUNT(*) AS "totalRequests",
          COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL) AS "resolvedCount",
          ROUND(
            COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
            / NULLIF(COUNT(*), 0)::numeric, 3
          ) AS "resolutionRate",
          ROUND(AVG(EXTRACT(EPOCH FROM (date_closed - date_requested)) / 86400)
            FILTER (WHERE date_closed IS NOT NULL AND date_requested IS NOT NULL
                    AND date_closed >= date_requested)::numeric, 1
          ) AS "avgDaysToResolve"
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
          AND date_requested >= date_trunc('month', NOW()) - INTERVAL '12 months'
          AND date_requested < date_trunc('month', NOW()) -- exclude current incomplete month
        GROUP BY date_trunc('month', date_requested)
        ORDER BY date_trunc('month', date_requested)
      ) t
    ) monthly,
    -- Current 6-month window resolution rate
    LATERAL (
      SELECT
        ROUND(COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0)::numeric, 3) AS rate,
        COUNT(*) AS vol
      FROM requests_311
      WHERE LOWER(comm_plan_name) = LOWER(cleaned)
        AND date_requested >= date_trunc('month', NOW()) - INTERVAL '6 months'
        AND date_requested < date_trunc('month', NOW())
    ) curr,
    -- Previous 6-month window resolution rate
    LATERAL (
      SELECT
        ROUND(COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0)::numeric, 3) AS rate,
        COUNT(*) AS vol
      FROM requests_311
      WHERE LOWER(comm_plan_name) = LOWER(cleaned)
        AND date_requested >= date_trunc('month', NOW()) - INTERVAL '12 months'
        AND date_requested < date_trunc('month', NOW()) - INTERVAL '6 months'
    ) prev;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
