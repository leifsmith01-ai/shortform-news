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
      article_title: article.title as string,
      article_url: article.url as string,
      source: article.source as string,
      category: article.category as string,
      country: article.country as string,
    }

    const { data, error } = await supabase
      .from('reading_history')
      .insert(row)
      .select()
      .single()

    if (error) throw error
    return data
  }
}

export default SupabaseApiService
