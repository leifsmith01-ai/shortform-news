// src/api/index.ts
// Automatically switches between mock API (development) and real API (production)
// Uses Supabase for saved articles & reading history when a user is signed in

import { mockApiService } from './mockApiService'
import { newsApiClient } from './newsApiClient'
import SupabaseApiService from './supabaseApiService'
import type { ApiClient, Article, FetchNewsParams } from '@/types/article'

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
    if (this.supabase) return await this.supabase.saveArticle(article as Record<string, unknown>)
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
      if (this.supabase) return await this.supabase.addToHistory(article as Record<string, unknown>) as Article
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
    return await this.supabase.addKeyword(keyword)
  }

  async deleteKeyword(id: string) {
    if (!this.supabase) throw new Error('Must be signed in to manage keywords')
    return await this.supabase.deleteKeyword(id)
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
    return await this.supabase.setReaction(article as Record<string, unknown>, reaction)
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
