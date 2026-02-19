// Supabase API Service
// Replaces localStorage with a real database, keyed by Clerk user ID

import { supabase } from '@/lib/supabaseClient'

class SupabaseApiService {
  private userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  // ─── Saved Articles ───────────────────────────────────────────────────────

  async getSavedArticles() {
    const { data, error } = await supabase
      .from('saved_articles')
      .select('*')
      .eq('user_id', this.userId)
      .order('saved_date', { ascending: false })

    if (error) throw error
    return data ?? []
  }

  async saveArticle(article: Record<string, unknown>) {
    const row = {
      user_id: this.userId,
      title: article.title as string,
      source: article.source as string,
      image_url: article.image_url as string,
      country: article.country as string,
      category: article.category as string,
      url: article.url as string,
      time_ago: article.time_ago as string,
      summary_points: article.summary_points ?? [],
    }

    const { data, error } = await supabase
      .from('saved_articles')
      .insert(row)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async unsaveArticle(articleId: string) {
    const { error } = await supabase
      .from('saved_articles')
      .delete()
      .eq('id', articleId)
      .eq('user_id', this.userId)

    if (error) throw error
    return { success: true }
  }

  // ─── Reading History ──────────────────────────────────────────────────────

  async getReadingHistory() {
    const { data, error } = await supabase
      .from('reading_history')
      .select('*')
      .eq('user_id', this.userId)
      .order('read_date', { ascending: false })
      .limit(100)

    if (error) throw error
    return data ?? []
  }

  async addToHistory(article: Record<string, unknown>) {
    const row = {
      user_id: this.userId,
      // NewsCard sends article_title/article_url; fall back to title/url for flexibility
      article_title: (article.article_title ?? article.title) as string,
      article_url: (article.article_url ?? article.url) as string,
      source: article.source as string,
      category: article.category as string,
      country: article.country as string,
      read_date: (article.read_date ?? new Date().toISOString()) as string,
    }

    const { data, error } = await supabase
      .from('reading_history')
      .insert(row)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // ─── Tracked Keywords ─────────────────────────────────────────────────────

  async getKeywords(): Promise<{ id: string; keyword: string; created_at: string }[]> {
    const { data, error } = await supabase
      .from('tracked_keywords')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  }

  async addKeyword(keyword: string): Promise<{ id: string; keyword: string; created_at: string }> {
    const { data, error } = await supabase
      .from('tracked_keywords')
      .insert({ user_id: this.userId, keyword: keyword.trim().toLowerCase() })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deleteKeyword(id: string): Promise<void> {
    const { error } = await supabase
      .from('tracked_keywords')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId)

    if (error) throw error
  }

  // ─── Article Reactions ────────────────────────────────────────────────────
  // Requires a Supabase table:
  //   article_reactions(id uuid PK, user_id text, article_url text,
  //     article_title text, source text, category text, country text,
  //     reaction text CHECK (reaction IN ('up','down')),
  //     created_at timestamptz DEFAULT now(),
  //     UNIQUE(user_id, article_url))

  async getReactions(): Promise<{ id: string; article_url: string; article_title: string; source: string; category: string; country: string; reaction: 'up' | 'down'; created_at: string }[]> {
    const { data, error } = await supabase
      .from('article_reactions')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  }

  async setReaction(article: Record<string, unknown>, reaction: 'up' | 'down') {
    const row = {
      user_id: this.userId,
      article_url: (article.article_url ?? article.url) as string,
      article_title: (article.article_title ?? article.title) as string,
      source: article.source as string,
      category: article.category as string,
      country: article.country as string,
      reaction,
    }

    const { data, error } = await supabase
      .from('article_reactions')
      .upsert(row, { onConflict: 'user_id,article_url' })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async removeReaction(articleUrl: string): Promise<void> {
    const { error } = await supabase
      .from('article_reactions')
      .delete()
      .eq('user_id', this.userId)
      .eq('article_url', articleUrl)

    if (error) throw error
  }
}

export default SupabaseApiService
