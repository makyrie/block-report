-- CreateFunction: get_community_metrics
-- Aggregates 311 metrics for a community, used by /api/311 endpoint

CREATE OR REPLACE FUNCTION get_community_metrics(community_name TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  cleaned TEXT;
BEGIN
  cleaned := replace(replace(community_name, '%', ''), '_', '');

  SELECT jsonb_build_object(
    'total_requests', COALESCE(agg.total, 0),
    'resolved_count', COALESCE(agg.resolved, 0),
    'avg_days_to_resolve', COALESCE(ROUND(agg.avg_days::numeric, 1), 0),
    'top_issues', COALESCE(ti.items, '[]'::jsonb),
    'recently_resolved', COALESCE(rr.items, '[]'::jsonb),
    'recent_resolved_90d', COALESCE(r90.cnt, 0),
    'top_recent_category', r90.top_cat,
    'top_recent_category_count', COALESCE(r90.top_cat_cnt, 0),
    'high_res_categories', COALESCE(hrc.items, '[]'::jsonb),
    'population', COALESCE(pop.total, 0)
  ) INTO result
  FROM
    (SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL) AS resolved,
      AVG(EXTRACT(EPOCH FROM (date_closed - date_requested)) / 86400)
        FILTER (WHERE date_closed IS NOT NULL AND date_requested IS NOT NULL
                AND date_closed >= date_requested) AS avg_days
    FROM requests_311
    WHERE LOWER(comm_plan_name) = LOWER(cleaned)
    ) agg,
    LATERAL (
      SELECT jsonb_agg(row_to_json(t)::jsonb) AS items FROM (
        SELECT service_name AS category, COUNT(*) AS count
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
        GROUP BY service_name
        ORDER BY count DESC
        LIMIT 10
      ) t
    ) ti,
    LATERAL (
      SELECT jsonb_agg(row_to_json(t)::jsonb) AS items FROM (
        SELECT service_name AS category, date_closed AS date
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
          AND date_closed IS NOT NULL
          AND (status = 'Closed' OR date_closed IS NOT NULL)
        ORDER BY date_closed DESC
        LIMIT 5
      ) t
    ) rr,
    LATERAL (
      SELECT
        cnt,
        top_cat,
        top_cat_cnt
      FROM (
        SELECT COUNT(*) AS cnt
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
          AND (status = 'Closed' OR date_closed IS NOT NULL)
          AND date_closed >= NOW() - INTERVAL '90 days'
      ) c,
      LATERAL (
        SELECT service_name AS top_cat, COUNT(*) AS top_cat_cnt
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
          AND (status = 'Closed' OR date_closed IS NOT NULL)
          AND date_closed >= NOW() - INTERVAL '90 days'
        GROUP BY service_name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) tc
    ) r90,
    LATERAL (
      SELECT jsonb_agg(row_to_json(t)::jsonb) AS items FROM (
        SELECT
          service_name AS category,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL) AS resolved,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
            / COUNT(*)::numeric * 100
          ) AS resolution_rate
        FROM requests_311
        WHERE LOWER(comm_plan_name) = LOWER(cleaned)
        GROUP BY service_name
        HAVING COUNT(*) >= 10
          AND COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
              / COUNT(*)::numeric >= 0.9
        ORDER BY COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric
              / COUNT(*)::numeric DESC
      ) t
    ) hrc,
    LATERAL (
      SELECT COALESCE(SUM(total_pop_5plus), 0) AS total
      FROM census_language
      WHERE LOWER(community) = LOWER(cleaned)
    ) pop;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
