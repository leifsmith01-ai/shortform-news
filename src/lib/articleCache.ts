// src/lib/articleCache.ts
// Client-side article cache backed by sessionStorage.
//
// Articles are stored by URL (unique key). When new articles arrive from
// the API, they are merged into the cache — existing articles (and their
// AI summaries) are preserved. The cache expires naturally when the tab
// closes (sessionStorage) and is capped at 500 articles to prevent
// storage quota issues.

import type { Article } from '@/types/article'

const CACHE_KEY = 'shortform_article_cache'
const MAX_CACHED_ARTICLES = 500

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
        const raw = sessionStorage.getItem(CACHE_KEY)
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
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(articles))
    } catch {
        // Storage quota exceeded — silently fail
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

        // Date filter — articles outside the window are kept but ranked lower
        // (handled in the sort below, not filtered out here)

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
        const scoreA = computeRankScore(a, now, cutoff)
        const scoreB = computeRankScore(b, now, cutoff)
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
        sessionStorage.removeItem(CACHE_KEY)
    } catch { /* noop */ }
}

// ── Scoring ─────────────────────────────────────────────────────────────

/**
 * Compute a composite ranking score for an article.
 * Higher = better ranking position.
 *
 * Factors:
 * - Recency: exponential decay — articles lose ranking as they age.
 *   Articles outside the selected date window get a heavy penalty but
 *   are NOT removed.
 * - Coverage count: articles covered by multiple sources rank higher.
 * - Country relevance score (if present).
 */
function computeRankScore(article: Article, now: number, cutoff: Date | null): number {
    // Base recency score (0-100)
    const publishedTime = article.publishedAt ? new Date(article.publishedAt).getTime() : now - 86400000
    const ageHours = Math.max(0, (now - publishedTime) / 3600000)

    // Exponential decay: half-life of 12 hours
    // score = 100 * 0.5^(ageHours/12)
    let recencyScore = 100 * Math.pow(0.5, ageHours / 12)

    // Penalty for articles outside the selected time window
    if (cutoff && publishedTime < cutoff.getTime()) {
        recencyScore *= 0.1 // 90% penalty — still visible but ranked very low
    }

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
    }
    return mapping[cat] || cat
}
