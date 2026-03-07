// api/keyword-sentiment.js - Vercel Serverless Function
// Generates an AI sentiment summary for a tracked keyword by analysing:
//   1. Recent news articles from the keyword_articles table (Supabase)
//   2. Social media: Reddit (OAuth + comments), Bluesky, Mastodon, YouTube, X/Twitter
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

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
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

function buildSentimentPrompt(keyword, newsTitles, socialData) {
  const {
    redditPosts = [], redditComments = [],
    blueskyPosts = [], mastodonPosts = [],
    youtubeComments = [], xPosts = [],
  } = socialData;

  const newsSection = newsTitles.length > 0
    ? `NEWS HEADLINES (${newsTitles.length} articles):\n${newsTitles.join('\n')}`
    : 'NEWS HEADLINES: none available';

  const socialLines = [];
  const platformNames = [];

  if (redditPosts.length > 0) {
    platformNames.push(`Reddit:${redditPosts.length}`);
    socialLines.push(`\nREDDIT (${redditPosts.length} posts, ranked by upvotes):`);
    for (const p of redditPosts) {
      socialLines.push(`  [↑${p.score ?? 0} | 💬${p.num_comments ?? 0}] ${p.title}`);
      const cd = redditComments.find(rc => rc.post?.id === p.id);
      if (cd?.comments?.length > 0) {
        for (const c of cd.comments) {
          socialLines.push(`    › [↑${c.score}] ${c.body}`);
        }
      }
    }
  }

  if (blueskyPosts.length > 0) {
    platformNames.push(`Bluesky:${blueskyPosts.length}`);
    socialLines.push(`\nBLUESKY (${blueskyPosts.length} posts):`);
    for (const p of blueskyPosts) {
      socialLines.push(`  [♥${p.likeCount} | ↺${p.repostCount}] ${p.text.slice(0, 200)}`);
    }
  }

  if (mastodonPosts.length > 0) {
    platformNames.push(`Mastodon:${mastodonPosts.length}`);
    socialLines.push(`\nMASTO DON (${mastodonPosts.length} posts):`);
    for (const p of mastodonPosts) {
      socialLines.push(`  [♥${p.favouritesCount} | ↺${p.reblogsCount}] ${p.content.slice(0, 200)}`);
    }
  }

  if (youtubeComments.length > 0) {
    platformNames.push(`YouTube:${youtubeComments.length}`);
    socialLines.push(`\nYOUTUBE COMMENTS (${youtubeComments.length} comments):`);
    for (const c of youtubeComments) {
      socialLines.push(`  [♥${c.likeCount}] ${c.text.slice(0, 200)}`);
    }
  }

  if (xPosts.length > 0) {
    platformNames.push(`X/Twitter:${xPosts.length}`);
    socialLines.push(`\nX/TWITTER (${xPosts.length} posts):`);
    for (const p of xPosts) {
      socialLines.push(`  [♥${p.likeCount} | ↺${p.retweetCount}] ${p.text.slice(0, 200)}`);
    }
  }

  const totalSocial = redditPosts.length + blueskyPosts.length + mastodonPosts.length + youtubeComments.length + xPosts.length;
  const socialSection = socialLines.length > 0
    ? `SOCIAL MEDIA DATA (${totalSocial} items — ${platformNames.join(', ')}):\n${socialLines.join('\n')}`
    : 'SOCIAL MEDIA DATA: none available';

  return `You are a media and social sentiment analyst. Analyse the following news headlines and social media posts about "${keyword}" and return a JSON object.

${newsSection}

${socialSection}

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
    "<Top social theme — key sentiment or detail, e.g. 'Outrage over CCTV footage — users questioning official account'>",
    "<Social theme — key detail>",
    "<Social theme — key detail>"
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
- Set socialSentiment and socialSummary to null if no social media data was provided
- Weight by engagement: posts/comments with higher scores carry more sentiment signal
- newsSummary: list the top 3-5 distinct news stories, each as "<topic> — <key detail or latest development>"
- socialSummary: list the top 3 social themes across all platforms, each as "<topic> — <public reaction or key detail>"
- Keep each bullet concise (one line), specific, and informative — not generic
- Keep themes concise (2-4 words each)
- narrativeFrames: identify 2-4 distinct angles journalists are using to frame this story
- keyEntities: the most mentioned people and organisations — max 5 each, omit the keyword subject itself if obvious
- headlineSplit: estimate the % breakdown of headline tones — must sum to 100`;
}

function parseSentimentJSON(text) {
  if (!text) return null;
  try {
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
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 }
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
      max_tokens: 1500
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
      max_tokens: 1500
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
      max_tokens: 1500
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
      max_tokens: 1500
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
      max_tokens: 1500
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
      max_tokens: 1500
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
      max_tokens: 1500
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

// ── News fetchers ─────────────────────────────────────────────────────────────

async function fetchNewsArticles(keyword, supabaseUrl, serviceKey, days) {
  try {
    const kwRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/tracked_keywords?keyword=eq.${encodeURIComponent(keyword)}&select=id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!kwRes.ok) return [];
    const kwRows = await kwRes.json();
    if (!Array.isArray(kwRows) || kwRows.length === 0) return [];

    const ids = kwRows.map(r => r.id).join(',');
    const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();

    const artRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/keyword_articles?keyword_id=in.(${ids})&select=title,description,source,published_at,country&published_at=gte.${since}&order=published_at.desc&limit=50`,
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

async function fetchNewsArticlesLive(keyword, appOrigin, days) {
  if (!appOrigin) return [];
  try {
    const dateRange = days <= 1 ? '24h' : days <= 3 ? '3d' : days <= 7 ? 'week' : 'month';
    const res = await fetchWithTimeout(`${appOrigin}/api/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchQuery: keyword, mode: 'keyword', dateRange, strictMode: false, forceRefresh: false }),
    }, 15000);
    if (!res.ok) return [];
    const data = await res.json();
    const articles = (data.articles || []).slice(0, 50).map(a => ({
      title: a.title,
      description: a.description,
      source: a.source?.name || a.source || null,
      published_at: a.publishedAt,
      country: a.country || null,
    }));
    console.log(`[sentiment] Live news fallback: ${articles.length} articles for "${keyword}"`);
    return articles;
  } catch (err) {
    console.warn('[sentiment] Live news fallback failed:', err.message);
    return [];
  }
}

// ── Reddit (RSS — no API credentials required) ────────────────────────────────

function parseRedditRSS(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  return entries.map(entry => {
    const rawTitle = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] ?? '';
    const title = rawTitle
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();
    const link = (entry.match(/<link[^>]*href="([^"]+)"/) || entry.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1]?.trim();
    // Extract subreddit + post ID from URL: /r/<sub>/comments/<id>/
    const m = link?.match(/\/r\/([^/]+)\/comments\/([^/]+)/);
    if (!title || !m) return null;
    return { title, subreddit: m[1], id: m[2], score: 0, num_comments: 0 };
  }).filter(Boolean);
}

async function fetchRedditPosts(keyword, days = 7) {
  try {
    const t = days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 30 ? 'month' : 'year';
    const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(keyword)}&sort=hot&t=${t}&limit=25`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'shortform-news/1.0 (RSS reader; +https://shortform.news)' },
    });
    if (!res.ok) { console.warn(`[sentiment] Reddit RSS returned ${res.status} for "${keyword}"`); return []; }
    const xml = await res.text();
    return parseRedditRSS(xml).slice(0, 15);
  } catch (err) {
    console.warn('[sentiment] Failed to fetch Reddit RSS:', err.message);
    return [];
  }
}

async function fetchRedditComments(posts) {
  const top3 = posts.slice(0, 3);
  const headers = { 'User-Agent': 'shortform-news/1.0 (RSS reader; +https://shortform.news)', 'Accept': 'application/json' };

  const results = await Promise.allSettled(top3.map(async post => {
    try {
      const url = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}.json?limit=5&sort=top&depth=1`;
      const res = await fetchWithTimeout(url, { headers }, 5000);
      if (!res.ok) return { post, comments: [] };
      const data = await res.json();
      const commentListing = Array.isArray(data) ? data[1] : null;
      const comments = (commentListing?.data?.children ?? [])
        .map(c => c.data)
        .filter(c => c?.body && c.body !== '[deleted]' && c.body !== '[removed]' && c.body.length < 500)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 3)
        .map(c => ({ body: c.body.slice(0, 200), score: c.score ?? 0, author: c.author ?? 'unknown' }));
      return { post, comments };
    } catch {
      return { post, comments: [] };
    }
  }));

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(r => r.comments.length > 0);
}

// ── Bluesky ───────────────────────────────────────────────────────────────────

async function fetchBlueskyPosts(keyword, days = 7) {
  try {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(keyword)}&limit=25&sort=top&since=${encodeURIComponent(since)}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) { console.warn(`[sentiment] Bluesky returned ${res.status} for "${keyword}"`); return []; }
    const data = await res.json();
    return (data.posts || [])
      .map(p => ({ text: p.record?.text || '', likeCount: p.likeCount ?? 0, repostCount: p.repostCount ?? 0 }))
      .filter(p => p.text)
      .slice(0, 15);
  } catch (err) {
    console.warn('[sentiment] Failed to fetch Bluesky posts:', err.message);
    return [];
  }
}

// ── Mastodon ──────────────────────────────────────────────────────────────────

async function fetchMastodonPosts(keyword, days = 7) {
  try {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    // aus.social is Australian-focused; mastodon.social as fallback
    for (const instance of ['aus.social', 'mastodon.social']) {
      const url = `https://${instance}/api/v2/search?q=${encodeURIComponent(keyword)}&type=statuses&limit=20&resolve=false`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 6000);
      if (!res.ok) continue;
      const data = await res.json();
      const posts = (data.statuses || [])
        .filter(s => s.created_at >= since)
        .map(s => ({
          content: s.content.replace(/<[^>]+>/g, '').slice(0, 300),
          favouritesCount: s.favourites_count ?? 0,
          reblogsCount: s.reblogs_count ?? 0,
        }))
        .filter(s => s.content)
        .slice(0, 10);
      if (posts.length > 0) return posts;
    }
    return [];
  } catch (err) {
    console.warn('[sentiment] Failed to fetch Mastodon posts:', err.message);
    return [];
  }
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function fetchYouTubeComments(keyword, days = 7) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];
  try {
    const publishedAfter = encodeURIComponent(new Date(Date.now() - days * 86400_000).toISOString());
    const searchRes = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(keyword)}&type=video&order=relevance&publishedAfter=${publishedAfter}&maxResults=5&key=${apiKey}`
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const videoIds = (searchData.items || []).map(v => v.id?.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    const allComments = [];
    await Promise.allSettled(videoIds.slice(0, 3).map(async videoId => {
      const commentsRes = await fetchWithTimeout(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&order=relevance&maxResults=10&key=${apiKey}`
      );
      if (!commentsRes.ok) return;
      const commentsData = await commentsRes.json();
      for (const item of (commentsData.items || [])) {
        const snippet = item.snippet?.topLevelComment?.snippet;
        if (snippet?.textDisplay) {
          allComments.push({
            text: snippet.textDisplay.replace(/<[^>]+>/g, '').slice(0, 300),
            likeCount: snippet.likeCount ?? 0,
          });
        }
      }
    }));

    return allComments.sort((a, b) => b.likeCount - a.likeCount).slice(0, 20);
  } catch (err) {
    console.warn('[sentiment] Failed to fetch YouTube comments:', err.message);
    return [];
  }
}

// ── X / Twitter ───────────────────────────────────────────────────────────────

async function fetchXPosts(keyword, days = 7) {
  const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return [];
  try {
    // Twitter v2 free tier: recent search limited to last 7 days
    const since = new Date(Date.now() - Math.min(days, 7) * 86400_000).toISOString();
    const query = encodeURIComponent(`${keyword} -is:retweet lang:en`);
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&start_time=${encodeURIComponent(since)}&max_results=100&tweet.fields=public_metrics`;
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
    if (!res.ok) { console.warn(`[sentiment] X/Twitter returned ${res.status} for "${keyword}"`); return []; }
    const data = await res.json();
    return (data.data || [])
      .sort((a, b) => {
        const scoreA = (a.public_metrics?.like_count ?? 0) + (a.public_metrics?.retweet_count ?? 0) * 2;
        const scoreB = (b.public_metrics?.like_count ?? 0) + (b.public_metrics?.retweet_count ?? 0) * 2;
        return scoreB - scoreA;
      })
      .slice(0, 20)
      .map(t => ({
        text: t.text.slice(0, 280),
        likeCount: t.public_metrics?.like_count ?? 0,
        retweetCount: t.public_metrics?.retweet_count ?? 0,
      }));
  } catch (err) {
    console.warn('[sentiment] Failed to fetch X/Twitter posts:', err.message);
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
  if (!['1', '3', '7', '30', '90'].includes(String(days))) {
    return res.status(400).json({ error: 'days must be 1, 3, 7, 30, or 90' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const LLM_KEYS = {
    gemini:     process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || null,
    cerebras:   process.env.CEREBRAS_API_KEY    || null,
    groq:       process.env.GROQ_API_KEY        || null,
    mistral:    process.env.MISTRAL_API_KEY     || null,
    sambanova:  process.env.SAMBANOVA_API_KEY   || null,
    openrouter: process.env.OPENROUTER_API_KEY  || null,
    openai:     process.env.OPENAI_API_KEY      || null,
    cohere:     process.env.COHERE_API_KEY      || null,
  };

  if (!Object.values(LLM_KEYS).some(Boolean)) {
    return res.status(503).json({ error: 'Sentiment analysis not configured (no LLM API keys)' });
  }

  const kw = keyword.trim();
  const cacheKey = `sentiment:${kw.toLowerCase()}:${days}`;

  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`[sentiment] Cache HIT: ${cacheKey}`);
    return res.status(200).json({ ...cached, cached: true });
  }

  // ── Fetch news (Supabase first, live fallback) ───────────────────────────
  let newsArticles = SUPABASE_URL && SERVICE_KEY
    ? await fetchNewsArticles(kw, SUPABASE_URL, SERVICE_KEY, days)
    : [];

  if (newsArticles.length === 0) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host']  || req.headers['host'] || '';
    const appOrigin =
      process.env.APP_ORIGIN ||
      process.env.VITE_APP_ORIGIN ||
      (host ? `${proto}://${host}` : 'https://shortform.news');
    newsArticles = await fetchNewsArticlesLive(kw, appOrigin, days);
  }

  // ── Fetch all social sources in parallel ────────────────────────────────
  const [redditPosts, blueskyPosts, mastodonPosts, youtubeComments, xPosts] = await Promise.all([
    fetchRedditPosts(kw, Number(days)),
    fetchBlueskyPosts(kw, Number(days)),
    fetchMastodonPosts(kw, Number(days)),
    fetchYouTubeComments(kw, Number(days)),
    fetchXPosts(kw, Number(days)),
  ]);

  // Fetch top comments for the highest-upvoted Reddit posts
  const redditComments = redditPosts.length > 0
    ? await fetchRedditComments(redditPosts)
    : [];

  const socialCount = redditPosts.length + blueskyPosts.length + mastodonPosts.length + youtubeComments.length + xPosts.length;

  if (newsArticles.length === 0 && socialCount === 0) {
    return res.status(404).json({ error: 'No content found for this keyword' });
  }

  // Build top posts with already-fetched comments for display in the UI
  const topPosts = redditPosts.slice(0, 3).map(p => {
    const commentData = redditComments.find(rc => rc.post?.id === p.id);
    const topComment = commentData?.comments?.[0] ?? null;
    return {
      title: p.title ?? '',
      subreddit: `r/${p.subreddit ?? ''}`,
      score: p.score ?? 0,
      numComments: p.num_comments ?? 0,
      url: `https://www.reddit.com/r/${p.subreddit}/comments/${p.id}/`,
      topComment: topComment ? { body: topComment.body, score: topComment.score, author: topComment.author } : null,
    };
  });

  // ── Build prompt and run LLM ────────────────────────────────────────────
  const newsTitles = newsArticles.map(a => a.title).filter(Boolean);
  const socialData  = { redditPosts, redditComments, blueskyPosts, mastodonPosts, youtubeComments, xPosts };

  const prompt = buildSentimentPrompt(kw, newsTitles, socialData);
  const result = await runSentimentAnalysis(prompt, LLM_KEYS);

  if (!result) {
    return res.status(503).json({ error: 'Sentiment analysis unavailable — all LLM providers failed' });
  }

  // ── Build payload ────────────────────────────────────────────────────────
  const socialSources = {};
  if (redditPosts.length    > 0) socialSources.reddit   = redditPosts.length;
  if (blueskyPosts.length   > 0) socialSources.bluesky  = blueskyPosts.length;
  if (mastodonPosts.length  > 0) socialSources.mastodon = mastodonPosts.length;
  if (youtubeComments.length > 0) socialSources.youtube = youtubeComments.length;
  if (xPosts.length         > 0) socialSources.twitter  = xPosts.length;

  const payload = {
    ...result,
    socialSentiment: result.socialSentiment ?? (socialCount > 0 ? result.sentiment : null),
    newsCount: newsArticles.length,
    redditCount: redditPosts.length, // kept for backwards compatibility
    socialCount,
    socialSources,
    topPosts,
    outletTiers: computeOutletTiers(newsArticles),
    geographicSpread: computeGeographicSpread(newsArticles),
  };

  await setCache(cacheKey, payload, SENTIMENT_CACHE_TTL);
  console.log(`[sentiment] Generated for "${kw}" — news:${newsArticles.length} reddit:${redditPosts.length} bluesky:${blueskyPosts.length} mastodon:${mastodonPosts.length} youtube:${youtubeComments.length} twitter:${xPosts.length}`);

  return res.status(200).json(payload);
}
