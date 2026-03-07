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
  threshold?: number
  last_article_count?: number
}

export interface KeywordTopic {
  id: string
  user_id: string
  name: string
  created_at: string
  keyword_topic_members?: { keyword_id: string }[]
}

export interface KeywordAlertSetting {
  id: string
  user_id: string
  keyword_id: string | null
  topic_id?: string | null
  email: string
  frequency: 'daily'
  enabled: boolean
  last_sent_at: string | null
  created_at: string
}

export interface SearchAnalyticsEntry {
  id: string
  user_id: string | null
  keyword: string
  expansion_source: string | null
  result_count: number | null
  is_boolean: boolean
  created_at: string
  top_sources?: Record<string, number>
  top_countries?: Record<string, number>
}

export interface GoogleTrendsData {
  interest: { date: string; value: number }[]
  direction: 'rising' | 'falling' | 'stable'
  changePct: number
  breakoutQueries: string[]
  cached?: boolean
}

export interface KeywordSentimentData {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  newsSentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  socialSentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null
  confidence: number
  summary: string
  newsSummary: string[] | string | null
  socialSummary: string[] | string | null
  themes: string[]
  narrativeFrames: string[]
  keyEntities: { people: string[]; organisations: string[] }
  headlineSplit: { positive: number; negative: number; neutral: number; mixed: number } | null
  outletTiers: { tier: string; label: string; count: number; pct: number }[]
  geographicSpread: { country: string; count: number }[]
  newsCount: number
  redditCount: number
  socialCount: number
  socialSources: { reddit?: number; bluesky?: number; mastodon?: number; youtube?: number; twitter?: number }
  cached?: boolean
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
  threshold?: number
  forceRefresh?: boolean
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
