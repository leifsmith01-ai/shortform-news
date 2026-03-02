-- Enable Row Level Security on tables exposed to PostgREST
-- that currently have it disabled, fixing Supabase Security Advisor warnings.
--
-- This app uses Clerk for authentication. The Clerk user ID is stored in the
-- `user_id` text column of each table.  When a Clerk JWT is forwarded to
-- Supabase (via the Clerk → Supabase JWT template), the user's ID is available
-- at runtime as:  auth.jwt() ->> 'sub'
--
-- Setup required (one-time, outside this migration):
--   1. Clerk Dashboard → Configure → JWT Templates → Create template named exactly "supabase"
--      - Claims: { "sub": "{{user.id}}", "role": "authenticated" }
--      - Leave algorithm as RS256 (default)
--      - Note the JWKS URL shown in the template editor
--
--   2. Supabase Dashboard → Authentication → Sign In / Up → Third-party auth
--      - Click "Add provider" → select Clerk
--      - Enter your Clerk JWKS endpoint:
--          https://<your-clerk-domain>/.well-known/jwks.json
--        (your-clerk-domain is shown in Clerk Dashboard → Domains)
--
--   3. The client-side code already handles token injection (see src/App.tsx).

-- ─── reading_history ─────────────────────────────────────────────────────────

ALTER TABLE public.reading_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this migration is idempotent (safe to re-run)
DROP POLICY IF EXISTS "Users can read own reading_history" ON public.reading_history;
DROP POLICY IF EXISTS "Users can insert own reading_history" ON public.reading_history;
DROP POLICY IF EXISTS "Users can delete own reading_history" ON public.reading_history;

-- Users can read their own history
CREATE POLICY "Users can read own reading_history"
  ON public.reading_history
  FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

-- Users can insert their own history rows
CREATE POLICY "Users can insert own reading_history"
  ON public.reading_history
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

-- Users can delete their own history rows
CREATE POLICY "Users can delete own reading_history"
  ON public.reading_history
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'sub');

-- ─── tracked_keywords ────────────────────────────────────────────────────────

ALTER TABLE public.tracked_keywords ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this migration is idempotent (safe to re-run)
DROP POLICY IF EXISTS "Users can read own tracked_keywords" ON public.tracked_keywords;
DROP POLICY IF EXISTS "Users can insert own tracked_keywords" ON public.tracked_keywords;
DROP POLICY IF EXISTS "Users can delete own tracked_keywords" ON public.tracked_keywords;

CREATE POLICY "Users can read own tracked_keywords"
  ON public.tracked_keywords
  FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own tracked_keywords"
  ON public.tracked_keywords
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own tracked_keywords"
  ON public.tracked_keywords
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'sub');

-- ─── article_reactions ───────────────────────────────────────────────────────

ALTER TABLE public.article_reactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this migration is idempotent (safe to re-run)
DROP POLICY IF EXISTS "Users can read own article_reactions" ON public.article_reactions;
DROP POLICY IF EXISTS "Users can upsert own article_reactions" ON public.article_reactions;
DROP POLICY IF EXISTS "Users can update own article_reactions" ON public.article_reactions;
DROP POLICY IF EXISTS "Users can delete own article_reactions" ON public.article_reactions;

CREATE POLICY "Users can read own article_reactions"
  ON public.article_reactions
  FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can upsert own article_reactions"
  ON public.article_reactions
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own article_reactions"
  ON public.article_reactions
  FOR UPDATE
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own article_reactions"
  ON public.article_reactions
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'sub');
