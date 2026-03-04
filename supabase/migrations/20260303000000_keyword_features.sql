-- Keyword & Media Monitoring improvements.
-- Run after all previous migrations.
-- All tables use Clerk user IDs (text) to match existing schema conventions.

-- ─── search_analytics ────────────────────────────────────────────────────────
-- The backend already writes to this table via the service role key.
-- Creating it here makes it official and adds RLS so users can read their own data.

CREATE TABLE IF NOT EXISTS public.search_analytics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT,
  keyword          TEXT        NOT NULL,
  expansion_source TEXT,
  result_count     INTEGER,
  is_boolean       BOOLEAN     DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_analytics_user_id_idx
  ON public.search_analytics (user_id);
CREATE INDEX IF NOT EXISTS search_analytics_created_at_idx
  ON public.search_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS search_analytics_keyword_idx
  ON public.search_analytics (keyword);

ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own search_analytics" ON public.search_analytics;
CREATE POLICY "Users can read own search_analytics"
  ON public.search_analytics
  FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

-- Inserts are done by the backend with the service role key (bypasses RLS).

-- ─── keyword_expansions ───────────────────────────────────────────────────────
-- Persistent cache for LLM-generated query expansions across serverless cold starts.
-- Accessed server-side only via service role key — no frontend RLS needed.

CREATE TABLE IF NOT EXISTS public.keyword_expansions (
  cache_key   TEXT        PRIMARY KEY,
  terms       TEXT[]      NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- ─── keyword_alert_settings ───────────────────────────────────────────────────
-- Stores per-keyword email alert preferences for each user.

CREATE TABLE IF NOT EXISTS public.keyword_alert_settings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  keyword_id   UUID        NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  frequency    TEXT        NOT NULL DEFAULT 'daily' CHECK (frequency = 'daily'),
  enabled      BOOLEAN     NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT keyword_alert_settings_unique UNIQUE (user_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS keyword_alert_settings_user_id_idx
  ON public.keyword_alert_settings (user_id);
CREATE INDEX IF NOT EXISTS keyword_alert_settings_enabled_idx
  ON public.keyword_alert_settings (enabled)
  WHERE enabled = true;

ALTER TABLE public.keyword_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own keyword_alert_settings" ON public.keyword_alert_settings;
DROP POLICY IF EXISTS "Users can insert own keyword_alert_settings" ON public.keyword_alert_settings;
DROP POLICY IF EXISTS "Users can update own keyword_alert_settings" ON public.keyword_alert_settings;
DROP POLICY IF EXISTS "Users can delete own keyword_alert_settings" ON public.keyword_alert_settings;

CREATE POLICY "Users can read own keyword_alert_settings"
  ON public.keyword_alert_settings FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own keyword_alert_settings"
  ON public.keyword_alert_settings FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own keyword_alert_settings"
  ON public.keyword_alert_settings FOR UPDATE
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own keyword_alert_settings"
  ON public.keyword_alert_settings FOR DELETE
  USING (user_id = auth.jwt() ->> 'sub');

-- ─── keyword_topics ───────────────────────────────────────────────────────────
-- Named groups of keywords for combined monitoring feeds.

CREATE TABLE IF NOT EXISTS public.keyword_topics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT keyword_topics_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS keyword_topics_user_id_idx
  ON public.keyword_topics (user_id);

ALTER TABLE public.keyword_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own keyword_topics" ON public.keyword_topics;
DROP POLICY IF EXISTS "Users can insert own keyword_topics" ON public.keyword_topics;
DROP POLICY IF EXISTS "Users can update own keyword_topics" ON public.keyword_topics;
DROP POLICY IF EXISTS "Users can delete own keyword_topics" ON public.keyword_topics;

CREATE POLICY "Users can read own keyword_topics"
  ON public.keyword_topics FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own keyword_topics"
  ON public.keyword_topics FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own keyword_topics"
  ON public.keyword_topics FOR UPDATE
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own keyword_topics"
  ON public.keyword_topics FOR DELETE
  USING (user_id = auth.jwt() ->> 'sub');

-- ─── keyword_topic_members ────────────────────────────────────────────────────
-- Junction table linking keywords to topics.

CREATE TABLE IF NOT EXISTS public.keyword_topic_members (
  topic_id    UUID NOT NULL REFERENCES public.keyword_topics(id) ON DELETE CASCADE,
  keyword_id  UUID NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, keyword_id)
);

ALTER TABLE public.keyword_topic_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own keyword_topic_members" ON public.keyword_topic_members;
DROP POLICY IF EXISTS "Users can insert own keyword_topic_members" ON public.keyword_topic_members;
DROP POLICY IF EXISTS "Users can delete own keyword_topic_members" ON public.keyword_topic_members;

-- Access controlled via parent topic ownership
CREATE POLICY "Users can read own keyword_topic_members"
  ON public.keyword_topic_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.keyword_topics t
      WHERE t.id = keyword_topic_members.topic_id
        AND t.user_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "Users can insert own keyword_topic_members"
  ON public.keyword_topic_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.keyword_topics t
      WHERE t.id = keyword_topic_members.topic_id
        AND t.user_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "Users can delete own keyword_topic_members"
  ON public.keyword_topic_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.keyword_topics t
      WHERE t.id = keyword_topic_members.topic_id
        AND t.user_id = auth.jwt() ->> 'sub'
    )
  );

-- ─── tracked_keywords: add threshold + last_article_count ────────────────────

ALTER TABLE public.tracked_keywords
  ADD COLUMN IF NOT EXISTS threshold NUMERIC DEFAULT 0.12,
  ADD COLUMN IF NOT EXISTS last_article_count INTEGER DEFAULT 0;

-- Add UPDATE policy to tracked_keywords (missing from original RLS migration)
DROP POLICY IF EXISTS "Users can update own tracked_keywords" ON public.tracked_keywords;
CREATE POLICY "Users can update own tracked_keywords"
  ON public.tracked_keywords FOR UPDATE
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');
