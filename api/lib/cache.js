// api/lib/cache.js
// In-memory cache management for the news API.
// Shared between news.js and any other handler that needs caching.
//
// NOTE: In-memory caches only persist within a single serverless instance.
// For cross-instance caching, pair with a distributed store (e.g. Upstash Redis).

export const CACHE = {};

export const CACHE_TTL_HOURS = 12;       // Regular news — refresh twice a day
export const CACHE_MAX_ENTRIES = 500;    // Prevent unbounded memory growth
export const KEYWORD_CACHE_TTL_HOURS = 1; // Keyword results — more time-sensitive

/**
 * Build a deterministic cache key for a country+category news request.
 */
export function getCacheKey(country, category, dateRange, sourceFingerprint, showNonEnglish) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const slot = now.getUTCHours() < 12 ? 'am' : 'pm';
  const sf = sourceFingerprint || 'all';
  const lang = showNonEnglish ? 'all' : 'en';
  return `${date}-${slot}-${country}-${category}-${dateRange || '24h'}-${sf}-${lang}`;
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
