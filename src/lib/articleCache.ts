// src/lib/articleCache.ts
// Client-side article cache backed by localStorage.
//
// Articles are stored by URL (unique key). When new articles arrive from
// the API, they are merged into the cache — existing articles (and their
// AI summaries) are preserved. The cache is capped at 500 articles to
// prevent storage quota issues. Using localStorage (vs sessionStorage)
// means the cache survives across browser sessions, eliminating the
// skeleton flash for returning visitors opening a new tab.

import type { Article } from '@/types/article'

const CACHE_KEY = 'shortform_article_cache'
const MAX_CACHED_ARTICLES = 500
// Articles older than this are considered stale for the instant-render path
const WARM_CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours

// ── Date range helpers ──────────────────────────────────────────────────
const DATE_RANGE_HOURS: Record<string, number> = {
    '24h': 24,
    '3d': 72,
    'week': 168,
    'month': 720,
}

/** Convert a dateRange key to a cutoff Date. Returns null if range is unknown. */
export function getDateRangeCutoff(dateRange: string): Date | null {
    const hours = DATE_RANGE_HOURS[dateRange]
    if (!hours) return null
    return new Date(Date.now() - hours * 60 * 60 * 1000)
}

// ── Cache I/O ───────────────────────────────────────────────────────────

function readCache(): Map<string, Article> {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return new Map()
        const articles: Article[] = JSON.parse(raw)
        return new Map(articles.map(a => [a.url, a]))
    } catch {
        return new Map()
    }
}

function writeCache(cache: Map<string, Article>) {
    try {
        // Keep the most recent articles if we exceed the cap
        let articles = Array.from(cache.values())
        if (articles.length > MAX_CACHED_ARTICLES) {
            articles.sort((a, b) => {
                const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
                const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
                return tb - ta // newest first
            })
            articles = articles.slice(0, MAX_CACHED_ARTICLES)
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(articles))
    } catch {
        // Storage quota exceeded — silently fail
    }
}

/**
 * Returns true if the cache has recent articles suitable for instant display
 * on page load (i.e. the newest article is within WARM_CACHE_MAX_AGE_MS).
 */
export function hasFreshCache(): boolean {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return false
        const articles: Article[] = JSON.parse(raw)
        if (!articles.length) return false
        const newest = articles.reduce((best, a) => {
            const t = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
            return t > best ? t : best
        }, 0)
        return Date.now() - newest < WARM_CACHE_MAX_AGE_MS
    } catch {
        return false
    }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Merge new articles into the cache and return the full merged set,
 * filtered by the given countries/categories/dateRange.
 *
 * - New articles overwrite existing ones UNLESS the existing one has
 *   summary_points and the new one doesn't (preserve AI summaries).
 * - Returns articles sorted by ranking score (freshness-weighted).
 */
export function mergeAndRank(
    freshArticles: Article[],
    opts: {
        countries: string[]
        categories: string[]
        dateRange: string
        searchQuery?: string
    }
): Article[] {
    const cache = readCache()

    // Merge fresh articles into cache
    for (const article of freshArticles) {
        if (!article.url) continue
        const existing = cache.get(article.url)
        if (existing) {
            // Preserve AI summaries from cache if the fresh article doesn't have them
            if (existing.summary_points?.length && !article.summary_points?.length) {
                article.summary_points = existing.summary_points
            }
        }
        cache.set(article.url, article)
    }

    // Track fresh article URLs so we can exempt them from the date filter below.
    // The backend already applied date enforcement (including intentional fill-up
    // for low-coverage pairs like Canada+Politics), so re-filtering them here
    // would silently drop those fill-up articles and miscount what was fetched.
    const freshUrls = new Set(freshArticles.map(a => a.url).filter(Boolean))

    writeCache(cache)

    // Filter cached articles by countries, categories, date range, and search query
    const cutoff = getDateRangeCutoff(opts.dateRange)
    const countrySet = new Set(opts.countries.map(c => c.toLowerCase()))
    const categorySet = new Set(opts.categories.map(c => c.toLowerCase()))
    const hasWorldCountry = countrySet.has('world')

    let filtered = Array.from(cache.values()).filter(article => {
        // Country filter (skip if 'world' is selected)
        if (!hasWorldCountry) {
            const articleCountry = (article.country || '').toLowerCase()
            if (articleCountry && !countrySet.has(articleCountry)) return false
        }

        // Category filter
        const articleCategory = (article.category || '').toLowerCase()
        if (articleCategory && !categorySet.has(articleCategory)) {
            // Map composite categories
            const mapped = mapCategory(articleCategory)
            if (!categorySet.has(mapped)) return false
        }

        // Date filter — skip for freshly fetched articles. The backend already
        // applied date enforcement, including intentional out-of-window fill-ups
        // for low-coverage pairs. Only trim stale articles from previous sessions.
        if (cutoff && !freshUrls.has(article.url || '')) {
            const publishedTime = article.publishedAt ? new Date(article.publishedAt).getTime() : 0
            if (publishedTime && publishedTime < cutoff.getTime()) return false
        }

        return true
    })

    // Search query filter
    if (opts.searchQuery) {
        const q = opts.searchQuery.toLowerCase()
        filtered = filtered.filter(a => {
            const text = `${a.title || ''} ${a.description || ''} ${a.content || ''}`.toLowerCase()
            return text.includes(q)
        })
    }

    // Rank: composite score = recency * source_authority * coverage
    const now = Date.now()
    filtered.sort((a, b) => {
        const scoreA = computeRankScore(a, now)
        const scoreB = computeRankScore(b, now)
        return scoreB - scoreA // highest score first
    })

    return filtered
}

/**
 * Get cached articles matching the given filters WITHOUT fetching new ones.
 * Useful for instant display on filter change.
 */
export function getCachedArticles(opts: {
    countries: string[]
    categories: string[]
    dateRange: string
    searchQuery?: string
}): Article[] {
    return mergeAndRank([], opts)
}

/**
 * Clear the article cache entirely.
 */
export function clearCache() {
    try {
        localStorage.removeItem(CACHE_KEY)
    } catch { /* noop */ }
}

// ── Scoring ─────────────────────────────────────────────────────────────

/**
 * Compute a composite ranking score for an article.
 * Higher = better ranking position.
 *
 * Factors:
 * - Recency: exponential decay — articles lose ranking as they age
 *   but stay visible within the selected time window.
 * - Coverage count: articles covered by multiple sources rank higher.
 * - Country relevance score (if present).
 */
function computeRankScore(article: Article, now: number): number {
    // Base recency score (0-100)
    const publishedTime = article.publishedAt ? new Date(article.publishedAt).getTime() : now - 86400000
    const ageHours = Math.max(0, (now - publishedTime) / 3600000)

    // Exponential decay: half-life of 12 hours
    // score = 100 * 0.5^(ageHours/12)
    const recencyScore = 100 * Math.pow(0.5, ageHours / 12)

    // Coverage bonus (multi-source articles are more important)
    const coverageCount = article._coverage?.count || 1
    const coverageBonus = Math.min(coverageCount * 5, 25) // max +25

    // Country relevance bonus
    const countryBonus = (article._countryScore || 0) * 2 // max +20

    return recencyScore + coverageBonus + countryBonus
}

// ── Category mapping ────────────────────────────────────────────────────

/** Map backend category names to frontend filter categories */
function mapCategory(cat: string): string {
    const mapping: Record<string, string> = {
        'technology': 'health-tech-science',
        'science': 'health-tech-science',
        'health': 'health-tech-science',
        'film': 'entertainment',
        'tv': 'entertainment',
        'gaming': 'entertainment',
        'music': 'entertainment',
    }
    return mapping[cat] || cat
}
