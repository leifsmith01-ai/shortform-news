// src/api/index.ts
// Automatically switches between mock API (development) and real API (production)
// Uses Supabase for saved articles & reading history when a user is signed in

import { mockApiService } from './mockApiService'
import { newsApiClient } from './newsApiClient'
import SupabaseApiService from './supabaseApiService'
import type { ApiClient, Article, FetchNewsParams, KeywordTopic, KeywordAlertSetting, SearchAnalyticsEntry, GoogleTrendsData } from '@/types/article'

// Use mock API ONLY if explicitly set to 'true', otherwise always use real API
const USE_MOCK_API = String(import.meta.env.VITE_USE_MOCK_API).toLowerCase() === 'true'

console.log(`Using ${USE_MOCK_API ? 'MOCK' : 'REAL'} API`)

class ApiService {
  private client: ApiClient
  // Supabase service instance — set once the Clerk user ID is known
  private supabase: SupabaseApiService | null = null
  // Stored separately so fetchNews can include it for search analytics
  private userId: string | null = null

  constructor() {
    this.client = (USE_MOCK_API ? mockApiService : newsApiClient) as ApiClient
  }

  // Call this from a React component once the Clerk user is loaded
  setUser(userId: string) {
    this.userId = userId
    this.supabase = new SupabaseApiService(userId)
  }

  clearUser() {
    this.userId = null
    this.supabase = null
  }

  // ─── News fetching ────────────────────────────────────────────────────────

  async fetchNews(params: FetchNewsParams) {
    try {
      // Include userId automatically for search analytics attribution
      return await this.client.fetchNews({ ...params, userId: this.userId || undefined })
    } catch (error) {
      console.error('Failed to fetch news:', error)
      throw error
    }
  }

  async getCachedNews(date?: string, country?: string, category?: string) {
    try {
      return await this.client.getCachedNews(date, country, category)
    } catch {
      return null
    }
  }

  async cacheNews(data: unknown) {
    try {
      return await this.client.cacheNews(data)
    } catch {
      return null
    }
  }

  // ─── Saved Articles — uses Supabase if signed in, mock otherwise ──────────

  async getSavedArticles(): Promise<Article[]> {
    try {
      if (this.supabase) return await this.supabase.getSavedArticles()
      return await this.client.getSavedArticles()
    } catch {
      return []
    }
  }

  async saveArticle(article: Article) {
    if (this.supabase) return await this.supabase.saveArticle(article as unknown as Record<string, unknown>)
    return await this.client.saveArticle(article)
  }

  async unsaveArticle(articleId: string) {
    if (this.supabase) return await this.supabase.unsaveArticle(articleId)
    return await this.client.unsaveArticle(articleId)
  }

  // ─── Reading History — uses Supabase if signed in, mock otherwise ─────────

  async getReadingHistory(): Promise<Article[]> {
    try {
      if (this.supabase) return await this.supabase.getReadingHistory()
      return await this.client.getReadingHistory()
    } catch {
      return []
    }
  }

  async addToHistory(article: Article): Promise<Article | null> {
    try {
      if (this.supabase) return await this.supabase.addToHistory(article as unknown as Record<string, unknown>) as Article
      return await this.client.addToHistory(article)
    } catch {
      return null
    }
  }

  // ─── Tracked Keywords — premium feature, requires sign-in ────────────────

  async getKeywords() {
    if (!this.supabase) throw new Error('Must be signed in to manage keywords')
    return await this.supabase.getKeywords()
  }

  async addKeyword(keyword: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage keywords')
    const result = await this.supabase.addKeyword(keyword)
    // Fire-and-forget an initial fetch to populate the `keyword_articles` table immediately
    this.fetchNews({
      countries: ['world'],
      categories: ['world'],
      searchQuery: keyword,
      mode: 'keyword',
      forceRefresh: true
    }).catch(err => console.error('Failed to pre-fetch articles for new keyword:', err))
    return result
  }

  async deleteKeyword(id: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage keywords')
    return await this.supabase.deleteKeyword(id)
  }

  async updateKeywordThreshold(id: string, threshold: number) {
    if (!this.supabase) throw new Error('Must be signed in to manage keywords')
    return await this.supabase.updateKeywordThreshold(id, threshold)
  }

  async updateKeywordArticleCount(id: string, count: number) {
    if (!this.supabase) throw new Error('Must be signed in')
    return await this.supabase.updateKeywordArticleCount(id, count)
  }

  // ─── Keyword Topics ───────────────────────────────────────────────────────

  async getTopics(): Promise<KeywordTopic[]> {
    if (!this.supabase) throw new Error('Must be signed in to manage topics')
    return await this.supabase.getTopics()
  }

  async createTopic(name: string): Promise<KeywordTopic> {
    if (!this.supabase) throw new Error('Must be signed in to manage topics')
    return await this.supabase.createTopic(name)
  }

  async deleteTopic(id: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage topics')
    return await this.supabase.deleteTopic(id)
  }

  async addKeywordToTopic(topicId: string, keywordId: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage topics')
    return await this.supabase.addKeywordToTopic(topicId, keywordId)
  }

  async removeKeywordFromTopic(topicId: string, keywordId: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage topics')
    return await this.supabase.removeKeywordFromTopic(topicId, keywordId)
  }

  // ─── Keyword Alert Settings ───────────────────────────────────────────────

  async getAlertSettings(): Promise<KeywordAlertSetting[]> {
    if (!this.supabase) throw new Error('Must be signed in to manage alerts')
    return await this.supabase.getAlertSettings()
  }

  async upsertAlertSetting(
    keywordId: string,
    email: string,
    frequency: 'daily',
    enabled: boolean
  ): Promise<KeywordAlertSetting> {
    if (!this.supabase) throw new Error('Must be signed in to manage alerts')
    return await this.supabase.upsertAlertSetting(keywordId, email, frequency, enabled)
  }

  async upsertTopicAlertSetting(
    topicId: string,
    email: string,
    frequency: 'daily',
    enabled: boolean
  ): Promise<KeywordAlertSetting> {
    if (!this.supabase) throw new Error('Must be signed in to manage alerts')
    return await this.supabase.upsertTopicAlertSetting(topicId, email, frequency, enabled)
  }

  async deleteAlertSetting(id: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage alerts')
    return await this.supabase.deleteAlertSetting(id)
  }

  // ─── Search Analytics ─────────────────────────────────────────────────────

  async getSearchAnalytics(days?: number, keyword?: string | string[]): Promise<SearchAnalyticsEntry[]> {
    if (!this.supabase) throw new Error('Must be signed in to view analytics')
    return await this.supabase.getSearchAnalytics(days, keyword)
  }

  // ─── Google Trends ────────────────────────────────────────────────────────

  async getGoogleTrends(keyword: string, days: 7 | 30 | 90): Promise<GoogleTrendsData> {
    const res = await fetch(`/api/google-trends?keyword=${encodeURIComponent(keyword)}&period=${days}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Google Trends request failed (${res.status})`)
    }
    return res.json() as Promise<GoogleTrendsData>
  }

  // ─── Article Reactions — requires sign-in ────────────────────────────────

  async getReactions() {
    try {
      if (!this.supabase) return []
      return await this.supabase.getReactions()
    } catch {
      return []
    }
  }

  async setReaction(article: Article, reaction: 'up' | 'down') {
    if (!this.supabase) throw new Error('Must be signed in to react to articles')
    return await this.supabase.setReaction(article as unknown as Record<string, unknown>, reaction)
  }

  async removeReaction(articleUrl: string) {
    if (!this.supabase) throw new Error('Must be signed in to remove reactions')
    return await this.supabase.removeReaction(articleUrl)
  }

  // ─── AI Summarization (unchanged) ─────────────────────────────────────────

  async summarizeWithClaude(articles: Article[]) {
    try {
      return await this.client.summarizeWithClaude(articles)
    } catch (error) {
      throw error
    }
  }
}

export const api = new ApiService()
export default api
