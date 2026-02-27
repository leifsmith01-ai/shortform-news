// src/types/article.ts
// Shared article shape used throughout the app.

export interface Article {
  id: string
  title: string
  description: string
  content: string
  url: string
  image_url: string | null
  source: string
  publishedAt: string
  time_ago: string
  country: string
  category: string
  summary_points: string[] | null
  savedAt?: string
  readAt?: string
  /** Multi-source coverage metadata added by the ranking engine */
  _coverage?: { count: number; sources: string[] }
  /** Country relevance score set by the relevance filter */
  _countryScore?: number
}

export interface Keyword {
  id: string
  keyword: string
  user_id: string
  created_at: string
}

export interface FetchNewsParams {
  countries: string[]
  categories: string[]
  searchQuery?: string
  dateRange?: string
  sources?: string[]
  language?: string
  userId?: string
  mode?: 'keyword'
  strictMode?: boolean
}

export interface FetchNewsResult {
  articles: Article[]
  totalResults?: number
  cached?: boolean
}

/** Interface that both newsApiClient and mockApiService must satisfy. */
export interface ApiClient {
  fetchNews(params: FetchNewsParams): Promise<FetchNewsResult>
  getSavedArticles(): Promise<Article[]>
  saveArticle(article: Article): Promise<Article>
  unsaveArticle(articleId: string): Promise<boolean>
  getReadingHistory(): Promise<Article[]>
  addToHistory(article: Article): Promise<Article | null>
  getCachedNews(date?: string, country?: string, category?: string): Promise<unknown>
  cacheNews(data: unknown): Promise<unknown>
  summarizeWithClaude(articles: Article[]): Promise<unknown>
}
