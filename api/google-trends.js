// api/google-trends.js - Vercel Serverless Function
// Proxies SerpAPI's Google Trends endpoint.
// Caches results in Redis (or in-process) for 6 hours to stay within free quota.

import { getCache, setCache } from './lib/redisCache.js';

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const TRENDS_CACHE_TTL = 6 * 3600; // 6 hours in seconds

// Map our period param to SerpAPI's date range format
function serpDate(period) {
  if (period === '7') return 'now 7-d';
  if (period === '90') return 'today 3-m';
  return 'today 1-m'; // default 30 days
}

// Compute direction and % change by comparing first half vs second half of data
function computeDirection(timeline) {
  if (!timeline || timeline.length < 2) return { direction: 'stable', changePct: 0 };
  const mid = Math.floor(timeline.length / 2);
  const first = timeline.slice(0, mid);
  const second = timeline.slice(mid);
  const avg = (arr) => arr.reduce((s, p) => s + p.value, 0) / (arr.length || 1);
  const avgFirst = avg(first);
  const avgSecond = avg(second);
  const changePct = avgFirst === 0 ? 0 : Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
  const direction = changePct > 5 ? 'rising' : changePct < -5 ? 'falling' : 'stable';
  return { direction, changePct };
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || 'https://shortform.news';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { keyword, period = '30' } = req.query;

  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return res.status(400).json({ error: 'keyword is required' });
  }
  if (!['7', '30', '90'].includes(String(period))) {
    return res.status(400).json({ error: 'period must be 7, 30, or 90' });
  }
  if (!SERPAPI_KEY) {
    return res.status(503).json({ error: 'Google Trends not configured (missing SERPAPI_KEY)' });
  }

  const cacheKey = `trends:${keyword.toLowerCase().trim()}:${period}`;

  // Check cache first
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`[google-trends] Cache HIT: ${cacheKey}`);
    return res.status(200).json({ ...cached, cached: true });
  }

  // Fetch from SerpAPI
  const params = new URLSearchParams({
    engine: 'google_trends',
    q: keyword.trim(),
    date: serpDate(period),
    api_key: SERPAPI_KEY,
  });

  let serpData;
  try {
    const serpRes = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!serpRes.ok) {
      const errText = await serpRes.text();
      console.error(`[google-trends] SerpAPI error ${serpRes.status}: ${errText}`);
      return res.status(502).json({ error: 'Failed to fetch from SerpAPI', status: serpRes.status });
    }
    serpData = await serpRes.json();
  } catch (err) {
    console.error('[google-trends] Fetch error:', err.message);
    return res.status(502).json({ error: 'Failed to reach SerpAPI' });
  }

  // Parse interest_over_time
  const timeline = (serpData.interest_over_time?.timeline_data ?? []).map((point) => ({
    date: point.date,
    value: point.values?.[0]?.extracted_value ?? 0,
  }));

  const { direction, changePct } = computeDirection(timeline);

  // Extract breakout / rising related queries (up to 5)
  const risingQueries = (serpData.related_queries?.rising ?? [])
    .slice(0, 5)
    .map((q) => q.query);

  const result = { interest: timeline, direction, changePct, breakoutQueries: risingQueries };

  // Cache for 6 hours
  await setCache(cacheKey, result, TRENDS_CACHE_TTL);

  return res.status(200).json({ ...result, cached: false });
}
