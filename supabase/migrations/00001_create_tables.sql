-- Libraries
CREATE TABLE libraries (
  objectid INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
);

-- Recreation centers
CREATE TABLE rec_centers (
  objectid INTEGER PRIMARY KEY,
  rec_bldg TEXT,
  park_name TEXT,
  fac_nm_id TEXT,
  address TEXT,
  zip TEXT,
  sq_ft DOUBLE PRECISION,
  year_built INTEGER,
  serv_dist TEXT,
  cd INTEGER,
  neighborhd TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
);

-- Transit stops
CREATE TABLE transit_stops (
  objectid INTEGER PRIMARY KEY,
  stop_uid TEXT,
  stop_id TEXT,
  stop_code TEXT,
  stop_name TEXT,
  stop_lat DOUBLE PRECISION,
  stop_lon DOUBLE PRECISION,
  stop_agncy TEXT,
  wheelchair INTEGER,
  intersec TEXT,
  stop_place TEXT,
  parent_sta TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
);

-- 311 / Get It Done requests
CREATE TABLE requests_311 (
  service_request_id TEXT PRIMARY KEY,
  date_requested TIMESTAMPTZ,
  case_age_days INTEGER,
  service_name TEXT,
  service_name_detail TEXT,
  date_closed TIMESTAMPTZ,
  status TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  street_address TEXT,
  zipcode TEXT,
  council_district TEXT,
  comm_plan_code TEXT,
  comm_plan_name TEXT,
  case_origin TEXT,
  public_description TEXT
);

CREATE INDEX idx_311_comm_plan ON requests_311 (comm_plan_name);
CREATE INDEX idx_311_date ON requests_311 (date_requested);

-- Census language data (ACS C16001 by tract)
CREATE TABLE census_language (
  tract TEXT PRIMARY KEY,
  total_pop_5plus INTEGER,
  english_only INTEGER,
  spanish INTEGER,
  french_haitian_cajun INTEGER,
  german_west_germanic INTEGER,
  russian_polish_slavic INTEGER,
  korean INTEGER,
  chinese INTEGER,
  vietnamese INTEGER,
  tagalog INTEGER,
  arabic INTEGER,
  other_unspecified INTEGER
);

-- Grant read access to anon (for backend API queries)
GRANT SELECT ON libraries TO anon;
GRANT SELECT ON rec_centers TO anon;
GRANT SELECT ON transit_stops TO anon;
GRANT SELECT ON requests_311 TO anon;
GRANT SELECT ON census_language TO anon;

-- Grant full access to service_role (for seeding)
GRANT ALL ON libraries TO service_role;
GRANT ALL ON rec_centers TO service_role;
GRANT ALL ON transit_stops TO service_role;
GRANT ALL ON requests_311 TO service_role;
GRANT ALL ON census_language TO service_role;

-- Helper function for re-runnable seeding
CREATE OR REPLACE FUNCTION truncate_seed_tables()
RETURNS void AS $$
BEGIN
  TRUNCATE libraries, rec_centers, transit_stops, requests_311, census_language;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
