// api/lib/rateLimit.js
// Simple in-memory rate limiter using a sliding window.
// Works per-serverless-instance (sufficient for basic abuse prevention).
// For multi-instance protection, pair with Upstash Redis.

const WINDOW_MS = 60 * 1000;       // 1-minute window
const MAX_REQUESTS = 30;           // requests per IP per window
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // prune stale entries every 5 minutes

// Map<ip, { count: number, windowStart: number }>
const store = new Map();

// Periodically clean up expired entries to avoid unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (now - entry.windowStart > WINDOW_MS) {
      store.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS).unref?.(); // .unref() so the interval doesn't block process exit

/**
 * Returns true if the request should be blocked (rate limit exceeded).
 * @param {string} ip - Client IP address
 * @param {number} [limit] - Override the default MAX_REQUESTS for this endpoint
 */
export function isRateLimited(ip, limit = MAX_REQUESTS) {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > limit) {
    return true;
  }
  return false;
}

/**
 * Extract client IP from a Vercel/Node request object.
 * Prefers the forwarded-for header set by Vercel's edge network.
 */
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Convenience: apply rate limit check and write a 429 response if exceeded.
 * Returns true if the response was sent (caller should return immediately).
 */
export function applyRateLimit(req, res, limit = MAX_REQUESTS) {
  const ip = getClientIp(req);
  if (isRateLimited(ip, limit)) {
    res.status(429).json({
      error: 'Too many requests. Please wait a moment before trying again.',
      retryAfter: 60,
    });
    return true;
  }
  return false;
}
