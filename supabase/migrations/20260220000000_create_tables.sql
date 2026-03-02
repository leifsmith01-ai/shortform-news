-- Create all application tables.
-- This migration MUST run before any RLS migrations (20260227000000 onward).
-- Uses IF NOT EXISTS so the file is idempotent if tables were created manually.
--
-- Authentication model: Clerk user IDs are stored as TEXT in user_id columns.
-- RLS policies (defined in later migrations) use auth.jwt() ->> 'sub' to match
-- the Clerk user ID from the forwarded JWT.
--
-- How to apply (no Supabase CLI configured for this project):
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run.
--   Then run 20260227000000_enable_rls.sql and 20260301000000_saved_articles_rls.sql in order.

-- ─── saved_articles ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_articles (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  title          TEXT,
  source         TEXT,
  image_url      TEXT,
  country        TEXT,
  category       TEXT,
  url            TEXT,
  time_ago       TEXT,
  summary_points TEXT[]      DEFAULT '{}',
  saved_date     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_articles_user_id_idx
  ON public.saved_articles (user_id);

CREATE INDEX IF NOT EXISTS saved_articles_saved_date_idx
  ON public.saved_articles (saved_date DESC);

-- ─── reading_history ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reading_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  article_title TEXT,
  article_url   TEXT,
  source        TEXT,
  category      TEXT,
  country       TEXT,
  read_date     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reading_history_user_id_idx
  ON public.reading_history (user_id);

CREATE INDEX IF NOT EXISTS reading_history_read_date_idx
  ON public.reading_history (read_date DESC);

-- ─── tracked_keywords ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tracked_keywords (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  keyword    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tracked_keywords_user_keyword_unique UNIQUE (user_id, keyword)
);

CREATE INDEX IF NOT EXISTS tracked_keywords_user_id_idx
  ON public.tracked_keywords (user_id);

-- ─── article_reactions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.article_reactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  article_url   TEXT        NOT NULL,
  article_title TEXT,
  source        TEXT,
  category      TEXT,
  country       TEXT,
  reaction      TEXT        CHECK (reaction IN ('up', 'down')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT article_reactions_user_url_unique UNIQUE (user_id, article_url)
);

CREATE INDEX IF NOT EXISTS article_reactions_user_id_idx
  ON public.article_reactions (user_id);
