// src/api/newsApiClient.ts
// Calls our Vercel serverless backend which handles NewsAPI + Gemini + Smart Cache

import type { Article, FetchNewsParams } from '@/types/article';

const API_BASE = '/api'; // Vercel serverless functions are at /api/*

/** Build a GET URL for the news endpoint so responses can be CDN-cached. */
function buildNewsUrl(params: FetchNewsParams): string {
  const p = new URLSearchParams();
  (params.countries ?? []).forEach(c => p.append('countries', c));
  (params.categories ?? []).forEach(c => p.append('categories', c));
  if (params.dateRange) p.set('dateRange', params.dateRange);
  if (params.language) p.set('language', params.language);
  if (params.searchQuery) p.set('searchQuery', params.searchQuery);
  (params.sources ?? []).forEach(s => p.append('sources', s));
  if (params.userId) p.set('userId', params.userId);
  if (params.mode) p.set('mode', params.mode);
  if (params.strictMode !== undefined) p.set('strictMode', String(params.strictMode));
  return `${API_BASE}/news?${p.toString()}`;
}

export const newsApiClient = {

  async fetchNews(params: FetchNewsParams) {
    try {
      const url = buildNewsUrl(params);

      // Consume the pre-flight request started by the inline script in index.html
      // (only valid if the URL matches — i.e. defaults haven't changed).
      const preload = (window as Record<string, unknown>).__newsPreload as
        | { url: string; promise: Promise<Response> }
        | undefined;
      let responsePromise: Promise<Response>;
      if (preload && preload.url === url) {
        responsePromise = preload.promise;
        delete (window as Record<string, unknown>).__newsPreload;
      } else {
        responsePromise = fetch(url);
      }

      const response = await responsePromise;

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

  async saveArticle(article: Article) {
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
      const updated = saved.filter((a: Article) => a.id !== articleId);
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

  async addToHistory(article: Article) {
    try {
      const history = await this.getReadingHistory();
      // Avoid duplicates - remove if already exists
      const filtered = history.filter((a: Article) => a.id !== article.id);
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
  async summarizeWithClaude(_articles: Article[]) { return null; }
};

export default newsApiClient;
