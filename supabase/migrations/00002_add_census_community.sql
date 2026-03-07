-- Add community column to census_language for tract-to-community mapping
ALTER TABLE census_language ADD COLUMN community TEXT;
CREATE INDEX idx_census_community ON census_language (community);
