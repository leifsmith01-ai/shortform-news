// src/api/index.ts
// Automatically switches between mock API (development) and real API (production)

import { mockApiService } from './mockApiService';
import { newsApiClient } from './newsApiClient';

// Use mock API ONLY if explicitly set to 'true', otherwise always use real API
const USE_MOCK_API = String(import.meta.env.VITE_USE_MOCK_API).toLowerCase() === 'true';

console.log(`Using ${USE_MOCK_API ? 'MOCK' : 'REAL'} API`);

class ApiService {
  private client: any;

  constructor() {
    this.client = USE_MOCK_API ? mockApiService : newsApiClient;
  }

  async fetchNews(params: {
    countries: string[];
    categories: string[];
    searchQuery?: string;
    dateRange?: string;
  }) {
    try {
      return await this.client.fetchNews(params);
    } catch (error) {
      console.error('Failed to fetch news:', error);
      throw error;
    }
  }

  async getCachedNews(date?: string, country?: string, category?: string) {
    try {
      return await this.client.getCachedNews(date, country, category);
    } catch (error) {
      return null;
    }
  }

  async cacheNews(data: any) {
    try {
      return await this.client.cacheNews(data);
    } catch (error) {
      return null;
    }
  }

  async getSavedArticles() {
    try {
      return await this.client.getSavedArticles();
    } catch (error) {
      return [];
    }
  }

  async saveArticle(article: any) {
    try {
      return await this.client.saveArticle(article);
    } catch (error) {
      throw error;
    }
  }

  async unsaveArticle(articleId: string) {
    try {
      return await this.client.unsaveArticle(articleId);
    } catch (error) {
      throw error;
    }
  }

  async getReadingHistory() {
    try {
      return await this.client.getReadingHistory();
    } catch (error) {
      return [];
    }
  }

  async addToHistory(article: any) {
    try {
      return await this.client.addToHistory(article);
    } catch (error) {
      return null;
    }
  }

  async summarizeWithClaude(articles: any[]) {
    try {
      return await this.client.summarizeWithClaude(articles);
    } catch (error) {
      throw error;
    }
  }
}

export const api = new ApiService();
export default api;
