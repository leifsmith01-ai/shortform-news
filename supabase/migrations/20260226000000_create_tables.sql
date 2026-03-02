-- Create all application tables.
-- This migration MUST run before the RLS migrations (20260227... and 20260301...).
-- All tables use user_id TEXT (not UUID) because Clerk user IDs are strings like "user_abc123".
-- IF NOT EXISTS guards make every statement safe to re-run if tables were created manually.

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

-- ─── reading_history ─────────────────────────────────────────────────────────

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

-- ─── tracked_keywords ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tracked_keywords (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  keyword    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, keyword)
);

CREATE INDEX IF NOT EXISTS tracked_keywords_user_id_idx
  ON public.tracked_keywords (user_id);

-- ─── article_reactions ───────────────────────────────────────────────────────

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
  UNIQUE (user_id, article_url)
);

CREATE INDEX IF NOT EXISTS article_reactions_user_id_idx
  ON public.article_reactions (user_id);
