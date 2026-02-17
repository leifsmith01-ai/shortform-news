// API Client for News Aggregator
// This is a generic implementation that can work with any backend

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const API_KEY = import.meta.env.VITE_API_KEY || '';

class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = API_URL;
    this.apiKey = API_KEY;
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      ...(options.headers as Record<string, string>),
    };

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // News endpoints
  async fetchNews(params: { countries: string[]; categories: string[]; searchQuery?: string; dateRange?: string }) {
    const { countries, categories, searchQuery, dateRange } = params;

    return this.request('/news', {
      method: 'POST',
      body: JSON.stringify({
        countries,
        categories,
        searchQuery,
        dateRange,
      }),
    });
  }

  async getCachedNews(date: string, country: string, category: string) {
    return this.request(`/news/cached?date=${date}&country=${country}&category=${category}`);
  }

  async cacheNews(data: { fetch_date: string; country: string; category: string; articles: unknown[] }) {
    return this.request('/news/cache', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Saved articles
  async getSavedArticles() {
    return this.request('/saved-articles');
  }

  async saveArticle(article: Record<string, unknown>) {
    return this.request('/saved-articles', {
      method: 'POST',
      body: JSON.stringify(article),
    });
  }

  async unsaveArticle(articleId: string) {
    return this.request(`/saved-articles/${articleId}`, {
      method: 'DELETE',
    });
  }

  // Reading history
  async getReadingHistory() {
    return this.request('/reading-history');
  }

  async addToHistory(article: Record<string, unknown>) {
    return this.request('/reading-history', {
      method: 'POST',
      body: JSON.stringify(article),
    });
  }

  // Claude AI integration (if you want to use Claude API directly)
  async summarizeWithClaude(articles: unknown[]) {
    return this.request('/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ articles }),
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export default ApiClient;
