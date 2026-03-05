-- Create the pgvector extension if it doesn't already exist
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- ─── keyword_articles ────────────────────────────────────────────────────────
-- Stores articles fetched by the background cron job for each tracked keyword.
-- Includes a vector embedding for semantic search.

CREATE TABLE IF NOT EXISTS public.keyword_articles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id   UUID        NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  article_url  TEXT        NOT NULL,
  
  -- Article Data
  title        TEXT        NOT NULL,
  description  TEXT,
  content      TEXT,
  source       TEXT,
  image_url    TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  
  -- Ranking Metadata
  author       TEXT,
  language     TEXT,
  country      TEXT,
  category     TEXT,
  
  -- Semantic Search
  -- 768 dimensions matches Gemini's text-embedding-004 model
  embedding    vector(768),
  
  -- Tracking
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure we don't store the exact same article twice for the same keyword
  CONSTRAINT keyword_articles_url_unique UNIQUE (keyword_id, article_url)
);

-- Indices for fast retrieval and joins
CREATE INDEX IF NOT EXISTS keyword_articles_keyword_id_idx
  ON public.keyword_articles (keyword_id);

CREATE INDEX IF NOT EXISTS keyword_articles_published_at_idx
  ON public.keyword_articles (published_at DESC);

-- HNSW index for fast approximate nearest neighbor search on the embedding
CREATE INDEX IF NOT EXISTS keyword_articles_embedding_idx 
  ON public.keyword_articles USING hnsw (embedding vector_cosine_ops);

-- RLS Policies
ALTER TABLE public.keyword_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their tracked keyword articles" ON public.keyword_articles;

-- Users can only read articles that belong to a keyword they track
-- Note: 'auth.jwt() ->> sub' is used for Clerk authentication
CREATE POLICY "Users can read their tracked keyword articles"
  ON public.keyword_articles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracked_keywords tk
      WHERE tk.id = keyword_articles.keyword_id
        AND tk.user_id = auth.jwt() ->> 'sub'
    )
  );

-- Inserts, Updates, Deletes are handled by the backend cron job using the Service Role key
-- Therefore, we don't need to define RLS policies for those actions.


-- ─── match_keyword_articles ──────────────────────────────────────────────────
-- RPC function to perform semantic search against keyword articles.
-- It filters by keyword_id first, then orders by vector cosine similarity.

CREATE OR REPLACE FUNCTION match_keyword_articles(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  k_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  keyword_id uuid,
  article_url text,
  title text,
  description text,
  source text,
  image_url text,
  published_at timestamptz,
  author text,
  country text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ka.id,
    ka.keyword_id,
    ka.article_url,
    ka.title,
    ka.description,
    ka.source,
    ka.image_url,
    ka.published_at,
    ka.author,
    ka.country,
    ka.category,
    1 - (ka.embedding <=> query_embedding) AS similarity
  FROM public.keyword_articles ka
  WHERE (k_id IS NULL OR ka.keyword_id = k_id)
    AND 1 - (ka.embedding <=> query_embedding) > match_threshold
  ORDER BY ka.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
