-- Migration: add topic_id support to keyword_alert_settings
-- This allows email alert digests to be configured at the feed (topic) level,
-- in addition to the existing per-keyword alerts.
--
-- Run after 20260303000000_keyword_features.sql

-- ── 1. Add nullable topic_id column ─────────────────────────────────────────────
ALTER TABLE public.keyword_alert_settings
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.keyword_topics(id) ON DELETE CASCADE;

-- ── 2. Replace unique constraint to support both keyword and topic alerts ─────────
-- The old constraint enforced UNIQUE(user_id, keyword_id), which prevents a user
-- from having both a keyword alert and a topic alert for the same keyword_id.
-- We switch to two partial unique indexes instead:
--   • one for keyword-level alerts  (topic_id IS NULL)
--   • one for topic-level alerts    (keyword_id IS NULL)

ALTER TABLE public.keyword_alert_settings
  DROP CONSTRAINT IF EXISTS keyword_alert_settings_unique;

CREATE UNIQUE INDEX IF NOT EXISTS keyword_alert_settings_keyword_unique
  ON public.keyword_alert_settings (user_id, keyword_id)
  WHERE topic_id IS NULL AND keyword_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS keyword_alert_settings_topic_unique
  ON public.keyword_alert_settings (user_id, topic_id)
  WHERE keyword_id IS NULL AND topic_id IS NOT NULL;

-- ── 3. Index for quick topic_id lookup ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS keyword_alert_settings_topic_id_idx
  ON public.keyword_alert_settings (topic_id)
  WHERE topic_id IS NOT NULL;
