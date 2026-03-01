-- Enable Row Level Security on saved_articles and add user-scoped policies.
-- This table was missing from the earlier enable_rls migration (20260227000000).
-- Uses auth.jwt() ->> 'sub' consistent with other tables (Clerk JWT integration).

ALTER TABLE public.saved_articles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any so this migration is idempotent
DROP POLICY IF EXISTS "Users can read own saved_articles" ON public.saved_articles;
DROP POLICY IF EXISTS "Users can insert own saved_articles" ON public.saved_articles;
DROP POLICY IF EXISTS "Users can delete own saved_articles" ON public.saved_articles;

CREATE POLICY "Users can read own saved_articles"
  ON public.saved_articles
  FOR SELECT
  USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own saved_articles"
  ON public.saved_articles
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete own saved_articles"
  ON public.saved_articles
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'sub');
