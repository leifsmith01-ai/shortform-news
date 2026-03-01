// api/lib/cache.js
// In-memory cache management for the news API.
// Shared between news.js and any other handler that needs caching.
//
// NOTE: In-memory caches only persist within a single serverless instance.
// For cross-instance caching, pair with a distributed store (e.g. Upstash Redis).

export const CACHE = {};

export const CACHE_TTL_HOURS = 720;             // 30 days — articles accumulate for up to a month
export const CACHE_MAX_ENTRIES = 500;            // Prevent unbounded memory growth
export const KEYWORD_CACHE_TTL_HOURS = 1;        // Keyword results — more time-sensitive
export const REFRESH_INTERVAL_HOURS = 6;         // Only fetch new articles every 6 hours
export const MAX_ARTICLE_AGE_HOURS = 720;        // Evict articles older than 30 days

/**
 * Build a deterministic cache key for a country+category news request.
 * NOTE: dateRange is NOT part of the key — all timeframes share one pool.
 */
export function getCacheKey(country, category, dateRange, sourceFingerprint, showNonEnglish) {
  const sf = sourceFingerprint || 'all';
  const lang = showNonEnglish ? 'all' : 'en';
  // dateRange parameter kept in signature for backward compat but ignored in key
  return `pool-${country}-${category}-${sf}-${lang}`;
}

/**
 * Short hash of a user-selected source list, used as part of cache keys.
 * Returns 'all' when no sources are selected.
 */
export function getSourceFingerprint(userSources) {
  if (!userSources || userSources.length === 0) return 'all';
  const sorted = [...userSources].sort().join(',');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Returns true if a cache entry is still within its TTL.
 * Keyword cache entries (key starts with 'kw-') use KEYWORD_CACHE_TTL_HOURS.
 */
export function isCacheValid(cacheEntry, key) {
  if (!cacheEntry) return false;
  const ageInHours = (Date.now() - cacheEntry.timestamp) / (1000 * 60 * 60);
  const ttl = key?.startsWith('kw-') ? KEYWORD_CACHE_TTL_HOURS : CACHE_TTL_HOURS;
  return ageInHours < ttl;
}

/**
 * Returns true if the cache entry needs a refresh (new articles should be fetched).
 * A refresh is needed when lastFetchedAt is older than REFRESH_INTERVAL_HOURS.
 * The cache entry itself remains valid — we just merge new articles into it.
 */
export function isRefreshNeeded(cacheEntry) {
  if (!cacheEntry) return true;
  const lastFetched = cacheEntry.lastFetchedAt || cacheEntry.timestamp || 0;
  const ageInHours = (Date.now() - lastFetched) / (1000 * 60 * 60);
  return ageInHours >= REFRESH_INTERVAL_HOURS;
}

/**
 * Merge fresh articles into an existing cached pool, deduplicating by URL.
 * Newer versions of an article (by publishedAt) replace older ones.
 * Articles older than MAX_ARTICLE_AGE_HOURS are evicted.
 */
export function mergeArticles(existingArticles, freshArticles) {
  const byUrl = new Map();
  const cutoff = Date.now() - MAX_ARTICLE_AGE_HOURS * 60 * 60 * 1000;

  // Index existing articles by URL
  for (const article of existingArticles) {
    if (!article.url) continue;
    const pubTime = article.publishedAt ? new Date(article.publishedAt).getTime() : Date.now();
    if (pubTime >= cutoff) {
      byUrl.set(article.url, article);
    }
    // Articles older than 30 days are naturally evicted by not adding them
  }

  // Merge fresh articles (overwrite existing unless existing has summary and fresh doesn't)
  for (const article of freshArticles) {
    if (!article.url) continue;
    const existing = byUrl.get(article.url);
    if (existing) {
      // Preserve AI summaries from cached version if fresh doesn't have them
      if (existing.summary_points?.length && !article.summary_points?.length) {
        article.summary_points = existing.summary_points;
      }
    }
    byUrl.set(article.url, article);
  }

  return Array.from(byUrl.values());
}

/**
 * Evict the oldest entries when the cache exceeds CACHE_MAX_ENTRIES.
 * Uses an O(n log n) sort on timestamps — acceptable since eviction is rare.
 */
export function evictCacheIfNeeded() {
  const keys = Object.keys(CACHE);
  if (keys.length <= CACHE_MAX_ENTRIES) return;
  const sorted = keys
    .map(k => ({ key: k, ts: CACHE[k].timestamp || 0 }))
    .sort((a, b) => a.ts - b.ts);
  const toRemove = sorted.slice(0, keys.length - CACHE_MAX_ENTRIES);
  for (const { key } of toRemove) delete CACHE[key];
}
