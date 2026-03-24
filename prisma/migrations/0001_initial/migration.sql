-- CreateTable
CREATE TABLE "libraries" (
    "objectid" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "libraries_pkey" PRIMARY KEY ("objectid")
);

-- CreateTable
CREATE TABLE "rec_centers" (
    "objectid" INTEGER NOT NULL,
    "rec_bldg" TEXT,
    "park_name" TEXT,
    "fac_nm_id" TEXT,
    "address" TEXT,
    "zip" TEXT,
    "sq_ft" DOUBLE PRECISION,
    "year_built" INTEGER,
    "serv_dist" TEXT,
    "cd" INTEGER,
    "neighborhd" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "rec_centers_pkey" PRIMARY KEY ("objectid")
);

-- CreateTable
CREATE TABLE "transit_stops" (
    "objectid" INTEGER NOT NULL,
    "stop_uid" TEXT,
    "stop_id" TEXT,
    "stop_code" TEXT,
    "stop_name" TEXT,
    "stop_lat" DOUBLE PRECISION,
    "stop_lon" DOUBLE PRECISION,
    "stop_agncy" TEXT,
    "wheelchair" INTEGER,
    "intersec" TEXT,
    "stop_place" TEXT,
    "parent_sta" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "transit_stops_pkey" PRIMARY KEY ("objectid")
);

-- CreateTable
CREATE TABLE "requests_311" (
    "service_request_id" TEXT NOT NULL,
    "date_requested" TIMESTAMP(3),
    "case_age_days" INTEGER,
    "service_name" TEXT,
    "service_name_detail" TEXT,
    "date_closed" TIMESTAMP(3),
    "status" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "street_address" TEXT,
    "zipcode" TEXT,
    "council_district" TEXT,
    "comm_plan_code" TEXT,
    "comm_plan_name" TEXT,
    "case_origin" TEXT,
    "public_description" TEXT,

    CONSTRAINT "requests_311_pkey" PRIMARY KEY ("service_request_id")
);

-- CreateTable
CREATE TABLE "census_language" (
    "tract" TEXT NOT NULL,
    "total_pop_5plus" INTEGER,
    "english_only" INTEGER,
    "spanish" INTEGER,
    "french_haitian_cajun" INTEGER,
    "german_west_germanic" INTEGER,
    "russian_polish_slavic" INTEGER,
    "korean" INTEGER,
    "chinese" INTEGER,
    "vietnamese" INTEGER,
    "tagalog" INTEGER,
    "arabic" INTEGER,
    "other_unspecified" INTEGER,
    "community" TEXT,

    CONSTRAINT "census_language_pkey" PRIMARY KEY ("tract")
);

-- CreateTable
CREATE TABLE "report_cache" (
    "id" SERIAL NOT NULL,
    "community" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_311_comm_plan" ON "requests_311"("comm_plan_name");

-- CreateIndex
CREATE INDEX "idx_311_date" ON "requests_311"("date_requested");

-- CreateIndex
CREATE INDEX "idx_census_community" ON "census_language"("community");

-- CreateIndex
CREATE UNIQUE INDEX "report_cache_community_language_key" ON "report_cache"("community", "language");

-- CreateIndex
CREATE INDEX "idx_report_cache_created_at" ON "report_cache"("created_at");

-- CreateIndex (P1: lat/lng index for block endpoint spatial queries)
CREATE INDEX "idx_311_lat_lng" ON "requests_311"("lat", "lng");

-- CreateFunction: get_community_metrics
-- Returns aggregated 311 metrics for a given community as JSONB
CREATE OR REPLACE FUNCTION get_community_metrics(community_name TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  WITH base AS (
    SELECT *
    FROM requests_311
    WHERE LOWER(comm_plan_name) = LOWER(community_name)
  ),
  counts AS (
    SELECT
      COUNT(*)::int AS total_requests,
      COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::int AS resolved_count,
      ROUND(AVG(
        CASE WHEN date_closed IS NOT NULL AND date_requested IS NOT NULL
          THEN EXTRACT(EPOCH FROM (date_closed - date_requested)) / 86400.0
        END
      )::numeric, 1) AS avg_days_to_resolve
    FROM base
  ),
  top_issues AS (
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.count DESC) AS val
    FROM (
      SELECT COALESCE(service_name, 'Unknown') AS category, COUNT(*)::int AS count
      FROM base
      GROUP BY service_name
      ORDER BY count DESC
      LIMIT 10
    ) t
  ),
  recently_resolved AS (
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.date DESC) AS val
    FROM (
      SELECT COALESCE(service_name, 'Unknown') AS category, date_closed::text AS date
      FROM base
      WHERE date_closed IS NOT NULL
      ORDER BY date_closed DESC
      LIMIT 5
    ) t
  ),
  recent_90d AS (
    SELECT
      COUNT(*) FILTER (WHERE date_closed IS NOT NULL AND date_closed >= NOW() - INTERVAL '90 days')::int AS recent_resolved_90d
    FROM base
  ),
  top_recent AS (
    SELECT COALESCE(service_name, 'Unknown') AS category, COUNT(*)::int AS cnt
    FROM base
    WHERE date_closed IS NOT NULL AND date_closed >= NOW() - INTERVAL '90 days'
    GROUP BY service_name
    ORDER BY cnt DESC
    LIMIT 1
  ),
  high_res AS (
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.resolution_rate DESC) AS val
    FROM (
      SELECT
        COALESCE(service_name, 'Unknown') AS category,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::int AS resolved,
        ROUND(
          (COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric / NULLIF(COUNT(*), 0)) * 100,
          0
        )::int AS resolution_rate
      FROM base
      GROUP BY service_name
      HAVING COUNT(*) >= 10
        AND (COUNT(*) FILTER (WHERE status = 'Closed' OR date_closed IS NOT NULL)::numeric / NULLIF(COUNT(*), 0)) >= 0.9
      ORDER BY resolution_rate DESC
      LIMIT 5
    ) t
  ),
  pop AS (
    SELECT COALESCE(SUM(total_pop_5plus), 0)::int AS population
    FROM census_language
    WHERE LOWER(community) = LOWER(community_name)
  )
  SELECT jsonb_build_object(
    'total_requests', c.total_requests,
    'resolved_count', c.resolved_count,
    'avg_days_to_resolve', COALESCE(c.avg_days_to_resolve, 0),
    'top_issues', COALESCE(ti.val, '[]'::jsonb),
    'recently_resolved', COALESCE(rr.val, '[]'::jsonb),
    'recent_resolved_90d', r9.recent_resolved_90d,
    'top_recent_category', tr.category,
    'top_recent_category_count', COALESCE(tr.cnt, 0),
    'high_res_categories', COALESCE(hr.val, '[]'::jsonb),
    'population', p.population
  ) INTO result
  FROM counts c
  CROSS JOIN top_issues ti
  CROSS JOIN recently_resolved rr
  CROSS JOIN recent_90d r9
  CROSS JOIN pop p
  LEFT JOIN top_recent tr ON TRUE
  CROSS JOIN high_res hr;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
