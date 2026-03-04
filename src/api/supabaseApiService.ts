// Supabase API Service
// Replaces localStorage with a real database, keyed by Clerk user ID

import { supabase } from '@/lib/supabaseClient'
import type { KeywordTopic, KeywordAlertSetting, SearchAnalyticsEntry } from '@/types/article'

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
      saved_date: (article.saved_date ?? new Date().toISOString()) as string,
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

  async updateKeywordThreshold(id: string, threshold: number): Promise<void> {
    const clamped = Math.min(Math.max(threshold, 0), 1)
    const { error } = await supabase
      .from('tracked_keywords')
      .update({ threshold: clamped })
      .eq('id', id)
      .eq('user_id', this.userId)

    if (error) throw error
  }

  async updateKeywordArticleCount(id: string, count: number): Promise<void> {
    const { error } = await supabase
      .from('tracked_keywords')
      .update({ last_article_count: count })
      .eq('id', id)
      .eq('user_id', this.userId)

    if (error) throw error
  }

  // ─── Keyword Topics ───────────────────────────────────────────────────────

  async getTopics(): Promise<KeywordTopic[]> {
    const { data, error } = await supabase
      .from('keyword_topics')
      .select('*, keyword_topic_members(keyword_id)')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  }

  async createTopic(name: string): Promise<KeywordTopic> {
    const { data, error } = await supabase
      .from('keyword_topics')
      .insert({ user_id: this.userId, name: name.trim() })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deleteTopic(id: string): Promise<void> {
    const { error } = await supabase
      .from('keyword_topics')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId)

    if (error) throw error
  }

  async addKeywordToTopic(topicId: string, keywordId: string): Promise<void> {
    const { error } = await supabase
      .from('keyword_topic_members')
      .insert({ topic_id: topicId, keyword_id: keywordId })

    if (error && !error.message.includes('duplicate')) throw error
  }

  async removeKeywordFromTopic(topicId: string, keywordId: string): Promise<void> {
    const { error } = await supabase
      .from('keyword_topic_members')
      .delete()
      .eq('topic_id', topicId)
      .eq('keyword_id', keywordId)

    if (error) throw error
  }

  // ─── Keyword Alert Settings ───────────────────────────────────────────────

  async getAlertSettings(): Promise<KeywordAlertSetting[]> {
    const { data, error } = await supabase
      .from('keyword_alert_settings')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  }

  async upsertAlertSetting(
    keywordId: string,
    email: string,
    frequency: 'daily',
    enabled: boolean
  ): Promise<KeywordAlertSetting> {
    const { data, error } = await supabase
      .from('keyword_alert_settings')
      .upsert(
        { user_id: this.userId, keyword_id: keywordId, email, frequency, enabled },
        { onConflict: 'user_id,keyword_id' }
      )
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deleteAlertSetting(id: string): Promise<void> {
    const { error } = await supabase
      .from('keyword_alert_settings')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId)

    if (error) throw error
  }

  // ─── Search Analytics ─────────────────────────────────────────────────────

  async getSearchAnalytics(days = 30, keyword?: string | string[]): Promise<SearchAnalyticsEntry[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    let query = supabase
      .from('search_analytics')
      .select('*')
      .eq('user_id', this.userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (Array.isArray(keyword)) {
      query = query.in('keyword', keyword)
    } else if (keyword) {
      query = query.eq('keyword', keyword)
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
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
