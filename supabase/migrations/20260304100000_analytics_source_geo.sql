-- Add source and geographic coverage columns to search_analytics.
-- These are populated by the news.js backend on each keyword fetch.
-- JSONB format: { "BBC News": 4, "Reuters": 3 } and { "gb": 5, "us": 3 }

ALTER TABLE search_analytics
  ADD COLUMN IF NOT EXISTS top_sources JSONB,
  ADD COLUMN IF NOT EXISTS top_countries JSONB;
