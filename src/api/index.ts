// Unified API Service
// Automatically switches between mock API (for development) and real API (for production)

import { apiClient } from './apiClient';
import { mockApiService } from './mockApiService';

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true' || !import.meta.env.VITE_API_URL;

type ApiClient = typeof apiClient | typeof mockApiService;

class ApiService {
  private client: ApiClient;

  constructor() {
    this.client = USE_MOCK_API ? mockApiService : apiClient;
    console.log(`Using ${USE_MOCK_API ? 'MOCK' : 'REAL'} API`);
  }

  async fetchNews(params: { countries: string[]; categories: string[]; searchQuery?: string; dateRange?: string }) {
    try {
      return await this.client.fetchNews(params);
    } catch (error) {
      console.error('Failed to fetch news:', error);
      throw error;
    }
  }

  async getCachedNews(date: string, country: string, category: string) {
    try {
      return await this.client.getCachedNews(date, country, category);
    } catch (error) {
      console.error('Failed to get cached news:', error);
      return null;
    }
  }

  async cacheNews(data: { fetch_date: string; country: string; category: string; articles: unknown[] }) {
    try {
      return await this.client.cacheNews(data);
    } catch (error) {
      console.error('Failed to cache news:', error);
      return null;
    }
  }

  async getSavedArticles() {
    try {
      return await this.client.getSavedArticles();
    } catch (error) {
      console.error('Failed to get saved articles:', error);
      return [];
    }
  }

  async saveArticle(article: Record<string, unknown>) {
    try {
      return await this.client.saveArticle(article);
    } catch (error) {
      console.error('Failed to save article:', error);
      throw error;
    }
  }

  async unsaveArticle(articleId: string) {
    try {
      return await this.client.unsaveArticle(articleId);
    } catch (error) {
      console.error('Failed to unsave article:', error);
      throw error;
    }
  }

  async getReadingHistory() {
    try {
      return await this.client.getReadingHistory();
    } catch (error) {
      console.error('Failed to get reading history:', error);
      return [];
    }
  }

  async addToHistory(article: Record<string, unknown>) {
    try {
      return await this.client.addToHistory(article);
    } catch (error) {
      console.error('Failed to add to history:', error);
      return null;
    }
  }

  async summarizeWithClaude(articles: unknown[]) {
    try {
      return await this.client.summarizeWithClaude(articles);
    } catch (error) {
      console.error('Failed to summarize with Claude:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const api = new ApiService();
export default api;
