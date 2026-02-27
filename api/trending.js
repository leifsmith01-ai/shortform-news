// api/trending.js - Dedicated trending news endpoint
// Fetches top headlines from all categories in parallel, returns top 10 newest

import { applyRateLimit } from './lib/rateLimit.js';
import { validateEnv } from './lib/validateEnv.js';
import { getCache, setCache } from './lib/redisCache.js';

const CACHE = {};
const CACHE_TTL_HOURS = 6; // Refresh trending more frequently than regular news

// Trusted NewsAPI source IDs — only surface articles from reputable outlets
// Note: NewsAPI enforces a maximum of 20 sources per request
const TRUSTED_SOURCE_IDS = [
  'reuters', 'bbc-news', 'associated-press',
  'the-new-york-times', 'the-washington-post', 'the-guardian-uk',
  'al-jazeera-english', 'cnn', 'nbc-news', 'cbs-news',
  'abc-news', 'bloomberg', 'the-wall-street-journal', 'politico',
  'espn', 'ars-technica', 'wired', 'techcrunch',
  'the-verge', 'new-scientist',
].join(','); // 20 sources — at the NewsAPI limit

function getCacheKey() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const slot = Math.floor(now.getUTCHours() / 6); // 4 slots per day
  return `trending-${date}-${slot}`;
}

function isCacheValid(entry) {
  if (!entry) return false;
  return (Date.now() - entry.timestamp) / (1000 * 60 * 60) < CACHE_TTL_HOURS;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Today';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatArticle(article, category) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || '',
    content: article.content || article.description || '',
    url: article.url || '#',
    image_url: article.urlToImage || null,
    source: article.source?.name || 'Unknown',
    publishedAt: article.publishedAt || new Date().toISOString(),
    time_ago: timeAgo(article.publishedAt),
    country: 'world',
    category,
    summary_points: null,
  };
}

async function fetchTrustedHeadlines(apiKey) {
  // NewsAPI does not allow combining `sources` with `category` — fetch once with all trusted sources
  const url = `https://newsapi.org/v2/top-headlines?sources=${TRUSTED_SOURCE_IDS}&pageSize=100&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI top-headlines: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI top-headlines: ${data.message}`);
  return (data.articles || [])
    .filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com')
    .map(a => formatArticle(a, 'general'));
}

async function fetchFromGuardian(apiKey) {
  // Guardian fallback — free 'test' key works without registration, real key via env var
  const params = new URLSearchParams({
    section: 'news,technology,business,science,sport,society',
    'show-fields': 'trailText,thumbnail',
    'page-size': '50',
    'order-by': 'newest',
    'api-key': apiKey || 'test',
  });
  const url = `https://content.guardianapis.com/search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Guardian fallback: ${res.status}`);
  const data = await res.json();
  if (data.response?.status !== 'ok') throw new Error(`Guardian fallback: ${data.response?.message}`);
  return (data.response?.results || []).map(a => ({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: a.webTitle || 'No title',
    description: a.fields?.trailText || '',
    content: a.fields?.trailText || '',
    url: a.webUrl || '#',
    image_url: a.fields?.thumbnail || null,
    source: 'The Guardian',
    publishedAt: a.webPublicationDate || new Date().toISOString(),
    time_ago: timeAgo(a.webPublicationDate),
    country: 'world',
    category: a.sectionId || 'general',
    summary_points: null,
  }));
}

class QuotaExceededError extends Error {
  constructor(provider) {
    super(`${provider} quota exceeded`);
    this.name = 'QuotaExceededError';
  }
}

const SUMMARY_PROMPT = (content) =>
  `You are a factual news summarizer. Based ONLY on the provided article text, write 2-3 concise bullet points covering the key facts. Do NOT add information that is not in the text.\n\n• Key point 1\n• Key point 2\n• Key point 3 (if warranted)\n\nArticle:\n${content}`;

function parseBullets(text) {
  if (!text) return null;
  let bullets = text.split('\n')
    .filter(line => /^[\s]*[•*\-–—]/.test(line))
    .map(line => line.replace(/^[\s]*[•*\-–—]+\s*/, '').trim())
    .filter(Boolean);
  if (bullets.length === 0) {
    bullets = text.split('\n')
      .filter(line => /^[\s]*\d+[\.\)]/.test(line))
      .map(line => line.replace(/^[\s]*\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length > 10);
  }
  return bullets.length > 0 ? bullets.slice(0, 3) : null;
}

function prepareContent(article) {
  const strippedContent = (article.content || '').replace(/\s*\[\+\d+ chars\].*$/s, '').trim();
  const desc = (article.description || '').replace(/\s*\[\+\d+ chars\].*$/s, '').trim();
  const body = strippedContent.length >= desc.length ? strippedContent : desc;
  let content = body || article.title || '';
  if (article.title && !content.toLowerCase().includes(article.title.slice(0, 20).toLowerCase())) {
    content = `${article.title}. ${content}`;
  }
  return content.slice(0, 3000);
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function tryGemini(content, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SUMMARY_PROMPT(content) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
    }),
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.code === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
    throw new QuotaExceededError('Gemini');
  }
  if (!res.ok) { console.error(`Gemini error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseBullets(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function tryGroq(content, key) {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: SUMMARY_PROMPT(content) }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.code === 'rate_limit_exceeded') {
    throw new QuotaExceededError('Groq');
  }
  if (!res.ok) { console.error(`Groq error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseBullets(data.choices?.[0]?.message?.content);
}

async function tryOpenAI(content, key) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: SUMMARY_PROMPT(content) }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.type === 'insufficient_quota' || data.error?.type === 'rate_limit_exceeded') {
    throw new QuotaExceededError('OpenAI');
  }
  if (!res.ok) { console.error(`OpenAI error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseBullets(data.choices?.[0]?.message?.content);
}

async function tryCohere(content, key) {
  const res = await fetchWithTimeout('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'command-r-08-2024',
      messages: [{ role: 'user', content: SUMMARY_PROMPT(content) }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('Cohere'); }
  if (!res.ok) { console.error(`Cohere error: ${JSON.stringify(data).slice(0, 100)}`); return null; }
  return parseBullets(data.message?.content?.[0]?.text);
}

async function generateSummary(article, llmKeys) {
  const content = prepareContent(article);
  const providers = [
    llmKeys.gemini && (() => tryGemini(content, llmKeys.gemini)),
    llmKeys.groq   && (() => tryGroq(content, llmKeys.groq)),
    llmKeys.openai && (() => tryOpenAI(content, llmKeys.openai)),
    llmKeys.cohere && (() => tryCohere(content, llmKeys.cohere)),
  ].filter(Boolean);

  for (const attempt of providers) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn(`[trending summary] ${err.message} — trying next provider`);
        continue;
      }
      console.error('[trending summary] unexpected error:', err.message);
    }
  }
  return null;
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || 'https://shortform.news';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting — 20 requests per IP per minute (trending is cheaper to cache)
  if (applyRateLimit(req, res, 20)) return;

  const { valid: envValid } = validateEnv(res, {
    required: ['NEWS_API_KEY'],
    optional: ['GUARDIAN_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'COHERE_API_KEY'],
  });
  if (!envValid) return;

  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY || null;
  const LLM_KEYS = {
    gemini: process.env.GEMINI_API_KEY || null,
    groq:   process.env.GROQ_API_KEY   || null,
    openai: process.env.OPENAI_API_KEY || null,
    cohere: process.env.COHERE_API_KEY || null,
  };
  const HAS_LLM = Object.values(LLM_KEYS).some(Boolean);

  const cacheKey = getCacheKey();
  const trendingCached = await getCache(cacheKey);
  if (trendingCached) {
    console.log(`Trending cache HIT: ${cacheKey}`);
    return res.status(200).json({ status: 'ok', articles: trendingCached.articles, cached: true });
  }

  try {
    let all;
    try {
      all = await fetchTrustedHeadlines(NEWS_API_KEY);
    } catch (err) {
      if (err.message.includes('429')) {
        console.warn('NewsAPI rate limited — falling back to Guardian');
        all = await fetchFromGuardian(GUARDIAN_API_KEY);
      } else {
        throw err;
      }
    }

    if (all.length === 0) {
      return res.status(200).json({ status: 'ok', articles: [], cached: false });
    }

    // Deduplicate and take top 10 newest
    const seen = new Set();
    const top10 = all
      .filter(a => {
        const key = a.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 10);

    // AI summaries for top 5 — multi-provider fallback (Gemini → Groq → OpenAI → Cohere)
    if (HAS_LLM) {
      await Promise.all(top10.slice(0, 5).map(async article => {
        try {
          const summary = await generateSummary(article, LLM_KEYS);
          if (summary) article.summary_points = summary;
        } catch (e) {
          console.error('Summary error:', e.message);
        }
      }));
    }

    await setCache(cacheKey, { timestamp: Date.now(), articles: top10 }, CACHE_TTL_HOURS * 3600);
    return res.status(200).json({ status: 'ok', articles: top10, totalResults: top10.length, cached: false });

  } catch (error) {
    console.error('Trending handler error:', error);
    return res.status(500).json({ error: 'Failed to fetch trending news' });
  }
}
