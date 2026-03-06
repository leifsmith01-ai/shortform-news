// api/keyword-sentiment.js - Vercel Serverless Function
// Generates an AI sentiment summary for a tracked keyword by analysing:
//   1. Recent news articles from the keyword_articles table (Supabase)
//   2. Recent Reddit posts via Reddit's free public JSON API
// Results are cached for 6 hours to stay within LLM free-tier limits.

import { getCache, setCache } from './lib/redisCache.js';

const SENTIMENT_CACHE_TTL = 6 * 3600; // 6 hours in seconds
const FETCH_TIMEOUT_MS = 10000;

class QuotaExceededError extends Error {
  constructor(provider) {
    super(`${provider} quota exceeded`);
    this.name = 'QuotaExceededError';
  }
}

function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

// ── Outlet tier helpers ───────────────────────────────────────────────────────

const PRESTIGE_SOURCES = [
  'reuters', 'associated press', 'ap news', 'ap ', 'bbc', 'new york times', 'nyt',
  'washington post', 'the economist', 'economist', 'financial times', 'ft.com', 'bloomberg',
  'wall street journal', 'wsj', 'the guardian', 'guardian', 'le monde', 'der spiegel',
];
const NATIONAL_SOURCES = [
  'cnn', 'npr', 'politico', 'axios', 'the atlantic', 'time', 'newsweek', 'usa today',
  'abc news', 'nbc news', 'cbs news', 'fox news', 'sky news', 'telegraph', 'the telegraph',
  'the independent', 'independent', 'the times', 'daily mail', 'mirror', 'sun ', 'afp',
  'al jazeera', 'dw', 'france 24', 'south china morning post', 'straitstimes', 'theage',
  'smh', 'sydney morning herald', 'the australian', 'globe and mail',
];

function classifyOutletTier(sourceName) {
  if (!sourceName) return 'regional';
  const s = sourceName.toLowerCase();
  if (PRESTIGE_SOURCES.some(t => s.includes(t))) return 'prestige';
  if (NATIONAL_SOURCES.some(t => s.includes(t))) return 'national';
  return 'regional';
}

function computeOutletTiers(articles) {
  const counts = { prestige: 0, national: 0, regional: 0 };
  for (const a of articles) counts[classifyOutletTier(a.source)]++;
  const total = articles.length || 1;
  return [
    { tier: 'prestige', label: 'Prestige / Wire', count: counts.prestige, pct: Math.round((counts.prestige / total) * 100) },
    { tier: 'national', label: 'National / Broadcast', count: counts.national, pct: Math.round((counts.national / total) * 100) },
    { tier: 'regional', label: 'Regional / Other', count: counts.regional, pct: Math.round((counts.regional / total) * 100) },
  ].filter(t => t.count > 0);
}

function computeGeographicSpread(articles) {
  const map = {};
  for (const a of articles) {
    if (a.country) map[a.country] = (map[a.country] ?? 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([country, count]) => ({ country, count }));
}

// ── LLM prompt ────────────────────────────────────────────────────────────────

function buildSentimentPrompt(keyword, newsTitles, redditTitles) {
  const newsSection = newsTitles.length > 0
    ? `NEWS HEADLINES (${newsTitles.length} articles):\n${newsTitles.join('\n')}`
    : 'NEWS HEADLINES: none available';
  const redditSection = redditTitles.length > 0
    ? `SOCIAL POSTS from Reddit (${redditTitles.length} posts):\n${redditTitles.join('\n')}`
    : 'SOCIAL POSTS: none available';

  return `You are a media and social sentiment analyst. Analyse the following news headlines and social media posts about "${keyword}" and return a JSON object.

${newsSection}

${redditSection}

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "sentiment": "positive" or "negative" or "neutral" or "mixed",
  "newsSentiment": "positive" or "negative" or "neutral" or "mixed",
  "socialSentiment": "positive" or "negative" or "neutral" or "mixed" or null,
  "confidence": <number between 0 and 1>,
  "summary": "<1-2 sentences describing the overall combined coverage tone>",
  "newsSummary": [
    "<Article topic — key detail or development, e.g. 'Trump Iran sanctions — new restrictions target oil exports and banking'>",
    "<Article topic — key detail>",
    "<Article topic — key detail>",
    "<Article topic — key detail>",
    "<Article topic — key detail>"
  ],
  "socialSummary": [
    "<Top social post topic — key sentiment or detail, e.g. 'Outrage over CCTV footage — users questioning official account'>",
    "<Post topic — key detail>",
    "<Post topic — key detail>"
  ] or null,
  "themes": ["<theme1>", "<theme2>", "<theme3>"],
  "narrativeFrames": ["<main narrative angle 1>", "<angle 2>", "<angle 3>"],
  "keyEntities": {
    "people": ["<full name>", "<full name>"],
    "organisations": ["<org name>", "<org name>"]
  },
  "headlineSplit": {
    "positive": <integer, % of headlines with positive tone>,
    "negative": <integer, % of headlines with negative tone>,
    "neutral": <integer, % of headlines with neutral/factual tone>,
    "mixed": <integer, % of headlines with mixed tone>
  }
}

Rules:
- Use "mixed" when coverage contains significant positive and negative elements
- Use "neutral" for purely factual, non-evaluative coverage
- Set socialSentiment and socialSummary to null if no Reddit posts were provided
- newsSummary: list the top 3-5 distinct news stories, each as "<topic> — <key detail or latest development>"
- socialSummary: list the top 3 social post themes, each as "<topic> — <public reaction or key detail>"
- Keep each bullet concise (one line), specific, and informative — not generic
- Keep themes concise (2-4 words each)
- narrativeFrames: identify 2-4 distinct angles journalists are using to frame this story (e.g. "accountability", "economic impact", "public health risk", "political fallout")
- keyEntities: the most mentioned people and organisations appearing alongside "${keyword}" — max 5 each, omit the keyword subject itself if it's obvious
- headlineSplit: estimate the % breakdown of headline tones — must sum to 100`;
}

function parseSentimentJSON(text) {
  if (!text) return null;
  try {
    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const validSentiments = ['positive', 'negative', 'neutral', 'mixed'];
    if (!validSentiments.includes(parsed.sentiment)) return null;
    return {
      sentiment: parsed.sentiment,
      newsSentiment: validSentiments.includes(parsed.newsSentiment) ? parsed.newsSentiment : 'neutral',
      socialSentiment: validSentiments.includes(parsed.socialSentiment) ? parsed.socialSentiment : null,
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7,
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
      newsSummary: Array.isArray(parsed.newsSummary)
        ? parsed.newsSummary.slice(0, 5).map(s => String(s).slice(0, 200))
        : typeof parsed.newsSummary === 'string' ? parsed.newsSummary.slice(0, 500) : null,
      socialSummary: Array.isArray(parsed.socialSummary)
        ? parsed.socialSummary.slice(0, 5).map(s => String(s).slice(0, 200))
        : typeof parsed.socialSummary === 'string' ? parsed.socialSummary.slice(0, 500) : null,
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 5).map(String) : [],
      narrativeFrames: Array.isArray(parsed.narrativeFrames) ? parsed.narrativeFrames.slice(0, 4).map(String) : [],
      keyEntities: {
        people: Array.isArray(parsed.keyEntities?.people) ? parsed.keyEntities.people.slice(0, 5).map(String) : [],
        organisations: Array.isArray(parsed.keyEntities?.organisations) ? parsed.keyEntities.organisations.slice(0, 5).map(String) : [],
      },
      headlineSplit: (parsed.headlineSplit && typeof parsed.headlineSplit === 'object') ? {
        positive: Math.max(0, Math.round(Number(parsed.headlineSplit.positive) || 0)),
        negative: Math.max(0, Math.round(Number(parsed.headlineSplit.negative) || 0)),
        neutral:  Math.max(0, Math.round(Number(parsed.headlineSplit.neutral)  || 0)),
        mixed:    Math.max(0, Math.round(Number(parsed.headlineSplit.mixed)    || 0)),
      } : null,
    };
  } catch {
    return null;
  }
}

// ── LLM providers ─────────────────────────────────────────────────────────────

async function sentimentWithGemini(prompt, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
    })
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.code === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
    throw new QuotaExceededError('Gemini');
  }
  if (!res.ok) { console.error(`[sentiment] Gemini error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function sentimentWithCerebras(prompt, key) {
  const res = await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('Cerebras'); }
  if (!res.ok) { console.error(`[sentiment] Cerebras error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.choices?.[0]?.message?.content);
}

async function sentimentWithGroq(prompt, key) {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.code === 'rate_limit_exceeded') {
    throw new QuotaExceededError('Groq');
  }
  if (!res.ok) { console.error(`[sentiment] Groq error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.choices?.[0]?.message?.content);
}

async function sentimentWithMistral(prompt, key) {
  const res = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('Mistral'); }
  if (!res.ok) { console.error(`[sentiment] Mistral error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.choices?.[0]?.message?.content);
}

async function sentimentWithSambaNova(prompt, key) {
  const res = await fetchWithTimeout('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'Meta-Llama-3.3-70B-Instruct',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('SambaNova'); }
  if (!res.ok) { console.error(`[sentiment] SambaNova error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.choices?.[0]?.message?.content);
}

async function sentimentWithOpenRouter(prompt, key) {
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('OpenRouter'); }
  if (!res.ok) { console.error(`[sentiment] OpenRouter error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.choices?.[0]?.message?.content);
}

async function sentimentWithOpenAI(prompt, key) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.type === 'insufficient_quota' || data.error?.type === 'rate_limit_exceeded') {
    throw new QuotaExceededError('OpenAI');
  }
  if (!res.ok) { console.error(`[sentiment] OpenAI error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.choices?.[0]?.message?.content);
}

async function sentimentWithCohere(prompt, key) {
  const res = await fetchWithTimeout('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'command-r-08-2024',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('Cohere'); }
  if (!res.ok) { console.error(`[sentiment] Cohere error: ${JSON.stringify(data).slice(0, 100)}`); return null; }
  return parseSentimentJSON(data.message?.content?.[0]?.text);
}

async function runSentimentAnalysis(prompt, llmKeys) {
  const providers = [
    llmKeys.gemini    && (() => sentimentWithGemini(prompt, llmKeys.gemini)),
    llmKeys.cerebras  && (() => sentimentWithCerebras(prompt, llmKeys.cerebras)),
    llmKeys.groq      && (() => sentimentWithGroq(prompt, llmKeys.groq)),
    llmKeys.mistral   && (() => sentimentWithMistral(prompt, llmKeys.mistral)),
    llmKeys.sambanova && (() => sentimentWithSambaNova(prompt, llmKeys.sambanova)),
    llmKeys.openrouter && (() => sentimentWithOpenRouter(prompt, llmKeys.openrouter)),
    llmKeys.openai    && (() => sentimentWithOpenAI(prompt, llmKeys.openai)),
    llmKeys.cohere    && (() => sentimentWithCohere(prompt, llmKeys.cohere)),
  ].filter(Boolean);

  for (const attempt of providers) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn(`[sentiment] ${err.message} — trying next provider`);
        continue;
      }
      console.error('[sentiment] unexpected LLM error:', err.message);
    }
  }
  return null;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchNewsArticles(keyword, supabaseUrl, serviceKey) {
  try {
    // Step 1: look up keyword_ids for this keyword name
    const kwRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/tracked_keywords?keyword=eq.${encodeURIComponent(keyword)}&select=id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!kwRes.ok) return [];
    const kwRows = await kwRes.json();
    if (!Array.isArray(kwRows) || kwRows.length === 0) return [];

    const ids = kwRows.map(r => r.id).join(',');

    // Step 2: fetch recent articles for those keyword_ids
    const artRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/keyword_articles?keyword_id=in.(${ids})&select=title,description,source,published_at,country&order=published_at.desc&limit=50`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!artRes.ok) return [];
    const articles = await artRes.json();
    return Array.isArray(articles) ? articles : [];
  } catch (err) {
    console.warn('[sentiment] Failed to fetch news articles:', err.message);
    return [];
  }
}

async function fetchRedditPosts(keyword) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=hot&t=week&limit=25&type=link`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'shortform-news/1.0 (sentiment analysis)' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const posts = data?.data?.children ?? [];
    return posts
      .map(p => p.data)
      .filter(p => p?.title)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 15);
  } catch (err) {
    console.warn('[sentiment] Failed to fetch Reddit posts:', err.message);
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const allowedOrigin = process.env.APP_ORIGIN || 'https://shortform.news';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { keyword, days = '7' } = req.query;

  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return res.status(400).json({ error: 'keyword is required' });
  }
  if (!['7', '30', '90'].includes(String(days))) {
    return res.status(400).json({ error: 'days must be 7, 30, or 90' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const LLM_KEYS = {
    gemini:     process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || null,
    cerebras:   process.env.CEREBRAS_API_KEY || null,
    groq:       process.env.GROQ_API_KEY || null,
    mistral:    process.env.MISTRAL_API_KEY || null,
    sambanova:  process.env.SAMBANOVA_API_KEY || null,
    openrouter: process.env.OPENROUTER_API_KEY || null,
    openai:     process.env.OPENAI_API_KEY || null,
    cohere:     process.env.COHERE_API_KEY || null,
  };

  if (!Object.values(LLM_KEYS).some(Boolean)) {
    return res.status(503).json({ error: 'Sentiment analysis not configured (no LLM API keys)' });
  }

  const kw = keyword.trim();
  const cacheKey = `sentiment:${kw.toLowerCase()}:${days}`;

  // Return cached result if available
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`[sentiment] Cache HIT: ${cacheKey}`);
    return res.status(200).json({ ...cached, cached: true });
  }

  // Fetch data sources in parallel
  const [newsArticles, redditPosts] = await Promise.all([
    SUPABASE_URL && SERVICE_KEY ? fetchNewsArticles(kw, SUPABASE_URL, SERVICE_KEY) : Promise.resolve([]),
    fetchRedditPosts(kw),
  ]);

  if (newsArticles.length === 0 && redditPosts.length === 0) {
    return res.status(404).json({ error: 'No content found for this keyword' });
  }

  const newsTitles = newsArticles.map(a => a.title).filter(Boolean);
  const redditTitles = redditPosts.map(p => p.title).filter(Boolean);

  const prompt = buildSentimentPrompt(kw, newsTitles, redditTitles);
  const result = await runSentimentAnalysis(prompt, LLM_KEYS);

  if (!result) {
    return res.status(503).json({ error: 'Sentiment analysis unavailable — all LLM providers failed' });
  }

  const payload = {
    ...result,
    newsCount: newsArticles.length,
    redditCount: redditPosts.length,
    outletTiers: computeOutletTiers(newsArticles),
    geographicSpread: computeGeographicSpread(newsArticles),
  };

  await setCache(cacheKey, payload, SENTIMENT_CACHE_TTL);
  console.log(`[sentiment] Generated for "${kw}" (${newsArticles.length} articles, ${redditPosts.length} Reddit posts)`);

  return res.status(200).json(payload);
}
