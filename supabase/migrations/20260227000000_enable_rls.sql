-- Enable Row Level Security on tables exposed to PostgREST
-- that currently have it disabled, fixing Supabase Security Advisor warnings.
--
-- This app uses Clerk for authentication. The Clerk user ID is stored in the
-- `user_id` text column of each table.  When a Clerk JWT is forwarded to
-- Supabase (via the Clerk → Supabase JWT template), the user's ID is available
-- at runtime as:  auth.jwt() ->> 'sub'
--
-- Setup required (one-time, outside this migration):
--   1. In Clerk Dashboard → JWT Templates → create a "Supabase" template.
--   2. In your Supabase project → Authentication → JWT Secret, add the
--      Clerk signing secret so Supabase can verify Clerk-issued JWTs.
--   3. Pass the Clerk session token to the Supabase client:
--        supabase.auth.setSession({ access_token: clerkToken, refresh_token: '' })
--      (or use the Clerk useSession hook + supabase.realtime.setAuth()).

-- ─── reading_history ─────────────────────────────────────────────────────────

ALTER TABLE public.reading_history ENABLE ROW LEVEL SECURITY;

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
