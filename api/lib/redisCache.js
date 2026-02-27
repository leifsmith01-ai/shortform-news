// api/lib/redisCache.js
// Optional distributed cache layer using Upstash Redis.
//
// When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in the
// environment, all cache reads/writes go through Redis instead of the
// in-process CACHE object. This ensures cache hits across all serverless
// instances rather than only within a single cold-start.
//
// If the env vars are absent (or Redis calls fail), the module falls back
// gracefully to the in-memory CACHE from cache.js — zero config required.
//
// Usage:
//   import { getCache, setCache } from './lib/redisCache.js';
//   const cached = await getCache(key);
//   await setCache(key, { articles, timestamp: Date.now() }, ttlSeconds);

import { CACHE, CACHE_TTL_HOURS, KEYWORD_CACHE_TTL_HOURS, isCacheValid } from './cache.js';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when Upstash credentials are configured. */
export const REDIS_ENABLED = Boolean(REDIS_URL && REDIS_TOKEN);

if (REDIS_ENABLED) {
  console.log('[redisCache] Upstash Redis distributed cache enabled');
} else {
  console.log('[redisCache] No Upstash credentials — using in-process cache');
}

// ── Low-level Upstash REST helpers ────────────────────────────────────────

async function redisCommand(command, args = []) {
  const body = JSON.stringify([command, ...args]);
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Upstash Redis error: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  return json.result;
}

async function redisGet(key) {
  const raw = await redisCommand('GET', [key]);
  return raw ? JSON.parse(raw) : null;
}

async function redisSet(key, value, ttlSeconds) {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await redisCommand('SET', [key, serialized, 'EX', ttlSeconds]);
  } else {
    await redisCommand('SET', [key, serialized]);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get a cache entry. Returns null on miss or error.
 * Checks Redis first, falls back to in-process CACHE.
 *
 * @param {string} key
 * @returns {Promise<{articles: unknown[], timestamp: number}|null>}
 */
export async function getCache(key) {
  if (REDIS_ENABLED) {
    try {
      const entry = await redisGet(key);
      if (entry) {
        console.log(`[redisCache] Redis HIT: ${key}`);
        return entry;
      }
    } catch (err) {
      console.warn(`[redisCache] Redis GET failed (falling back to in-process): ${err.message}`);
    }
  }

  // In-process fallback
  const entry = CACHE[key];
  return isCacheValid(entry, key) ? entry : null;
}

/**
 * Write a cache entry. Writes to Redis AND updates the in-process cache.
 * TTL defaults to 12 hours for regular keys, 1 hour for keyword keys.
 *
 * @param {string} key
 * @param {{ articles: unknown[], timestamp: number }} value
 * @param {number} [ttlSeconds] - optional override; defaults based on key type
 */
export async function setCache(key, value, ttlSeconds) {
  // Determine TTL
  const ttlHours = key?.startsWith('kw-') ? KEYWORD_CACHE_TTL_HOURS : CACHE_TTL_HOURS;
  const ttl = ttlSeconds ?? ttlHours * 3600;

  // Always update in-process cache for same-instance hits
  CACHE[key] = value;

  if (REDIS_ENABLED) {
    try {
      await redisSet(key, value, ttl);
      console.log(`[redisCache] Redis SET: ${key} (TTL ${ttl}s)`);
    } catch (err) {
      console.warn(`[redisCache] Redis SET failed (in-process cache still updated): ${err.message}`);
    }
  }
}

/**
 * Delete a cache entry from both Redis and in-process cache.
 * Useful for cache invalidation (e.g. admin endpoints).
 */
export async function deleteCache(key) {
  delete CACHE[key];
  if (REDIS_ENABLED) {
    try {
      await redisCommand('DEL', [key]);
    } catch (err) {
      console.warn(`[redisCache] Redis DEL failed: ${err.message}`);
    }
  }
}
