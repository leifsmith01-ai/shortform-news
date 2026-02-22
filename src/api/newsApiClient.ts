// src/api/newsApiClient.ts
// Calls our Vercel serverless backend which handles NewsAPI + Gemini + Smart Cache

const API_BASE = '/api'; // Vercel serverless functions are at /api/*

export const newsApiClient = {

  async fetchNews({ countries, categories, searchQuery, dateRange, sources }: {
    countries: string[];
    categories: string[];
    searchQuery?: string;
    dateRange?: string;
    sources?: string[];
  }) {
    try {
      const response = await fetch(`${API_BASE}/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countries, categories, searchQuery, dateRange, sources })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('fetchNews error:', error);
      throw error;
    }
  },

  // Saved articles stored in localStorage (no backend needed)
  async getSavedArticles() {
    try {
      const saved = localStorage.getItem('savedArticles');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  },

  async saveArticle(article: any) {
    try {
      const saved = await this.getSavedArticles();
      const updated = [...saved, { ...article, savedAt: new Date().toISOString() }];
      localStorage.setItem('savedArticles', JSON.stringify(updated));
      return article;
    } catch (error) {
      throw error;
    }
  },

  async unsaveArticle(articleId: string) {
    try {
      const saved = await this.getSavedArticles();
      const updated = saved.filter((a: any) => a.id !== articleId);
      localStorage.setItem('savedArticles', JSON.stringify(updated));
      return true;
    } catch (error) {
      throw error;
    }
  },

  // Reading history stored in localStorage
  async getReadingHistory() {
    try {
      const history = localStorage.getItem('readingHistory');
      return history ? JSON.parse(history) : [];
    } catch {
      return [];
    }
  },

  async addToHistory(article: any) {
    try {
      const history = await this.getReadingHistory();
      // Avoid duplicates - remove if already exists
      const filtered = history.filter((a: any) => a.id !== article.id);
      const updated = [{ ...article, readAt: new Date().toISOString() }, ...filtered].slice(0, 100);
      localStorage.setItem('readingHistory', JSON.stringify(updated));
      return article;
    } catch (error) {
      return null;
    }
  },

  // Cache functions (handled server-side, these are no-ops)
  async getCachedNews() { return null; },
  async cacheNews() { return null; },
  async summarizeWithClaude() { return null; }
};

export default newsApiClient;
