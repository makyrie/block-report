-- Revoke EXECUTE on get_community_metrics from PUBLIC.
-- The application user (owner) retains EXECUTE; this prevents
-- any other database role from calling the function directly.
REVOKE EXECUTE ON FUNCTION get_community_metrics(TEXT) FROM PUBLIC;
