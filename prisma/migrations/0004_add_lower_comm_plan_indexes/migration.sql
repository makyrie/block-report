-- DropTransaction
-- Add functional indexes on LOWER(comm_plan_name) and LOWER(community)
-- to support the case-insensitive lookups in get_community_metrics().
-- Without these, each call to that function triggers 5 sequential scans
-- on requests_311 and 1 on census_language.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requests_311_comm_plan_lower
  ON requests_311 (LOWER(comm_plan_name));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_census_language_community_lower
  ON census_language (LOWER(community));
