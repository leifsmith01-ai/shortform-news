// src/api/index.ts
// Automatically switches between mock API (development) and real API (production)
// Uses Supabase for saved articles & reading history when a user is signed in

import { mockApiService } from './mockApiService'
import { newsApiClient } from './newsApiClient'
import SupabaseApiService from './supabaseApiService'

// Use mock API ONLY if explicitly set to 'true', otherwise always use real API
const USE_MOCK_API = String(import.meta.env.VITE_USE_MOCK_API).toLowerCase() === 'true'

console.log(`Using ${USE_MOCK_API ? 'MOCK' : 'REAL'} API`)

class ApiService {
  private client: any
  // Supabase service instance — set once the Clerk user ID is known
  private supabase: SupabaseApiService | null = null

  constructor() {
    this.client = USE_MOCK_API ? mockApiService : newsApiClient
  }

  // Call this from a React component once the Clerk user is loaded
  setUser(userId: string) {
    this.supabase = new SupabaseApiService(userId)
  }

  clearUser() {
    this.supabase = null
  }

  // ─── News fetching (unchanged) ────────────────────────────────────────────

  async fetchNews(params: {
    countries: string[]
    categories: string[]
    searchQuery?: string
    dateRange?: string
  }) {
    try {
      return await this.client.fetchNews(params)
    } catch (error) {
      console.error('Failed to fetch news:', error)
      throw error
    }
  }

  async getCachedNews(date?: string, country?: string, category?: string) {
    try {
      return await this.client.getCachedNews(date, country, category)
    } catch (error) {
      return null
    }
  }

  async cacheNews(data: any) {
    try {
      return await this.client.cacheNews(data)
    } catch (error) {
      return null
    }
  }

  // ─── Saved Articles — uses Supabase if signed in, mock otherwise ──────────

  async getSavedArticles() {
    try {
      if (this.supabase) return await this.supabase.getSavedArticles()
      return await this.client.getSavedArticles()
    } catch (error) {
      return []
    }
  }

  async saveArticle(article: any) {
    if (this.supabase) return await this.supabase.saveArticle(article)
    return await this.client.saveArticle(article)
  }

  async unsaveArticle(articleId: string) {
    if (this.supabase) return await this.supabase.unsaveArticle(articleId)
    return await this.client.unsaveArticle(articleId)
  }

  // ─── Reading History — uses Supabase if signed in, mock otherwise ─────────

  async getReadingHistory() {
    try {
      if (this.supabase) return await this.supabase.getReadingHistory()
      return await this.client.getReadingHistory()
    } catch (error) {
      return []
    }
  }

  async addToHistory(article: any) {
    try {
      if (this.supabase) return await this.supabase.addToHistory(article)
      return await this.client.addToHistory(article)
    } catch (error) {
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

  // ─── AI Summarization (unchanged) ─────────────────────────────────────────

  async summarizeWithClaude(articles: any[]) {
    try {
      return await this.client.summarizeWithClaude(articles)
    } catch (error) {
      throw error
    }
  }
}

export const api = new ApiService()
export default api
