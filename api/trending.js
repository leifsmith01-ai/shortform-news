// api/trending.js - Dedicated trending news endpoint
// Fetches top headlines from all categories in parallel, returns top 10 newest

const CACHE = {};
const CACHE_TTL_HOURS = 6; // Refresh trending more frequently than regular news

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
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null,
  };
}

async function fetchCategory(category, apiKey) {
  const categoryMap = {
    technology: 'technology', business: 'business', science: 'science',
    health: 'health', sports: 'sports', entertainment: 'entertainment',
    general: 'general',
  };
  const mapped = categoryMap[category] || 'general';
  const url = `https://newsapi.org/v2/top-headlines?language=en&category=${mapped}&pageSize=8&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI ${category}: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI ${category}: ${data.message}`);
  return (data.articles || [])
    .filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com')
    .map(a => formatArticle(a, category));
}

async function generateSummary(article, geminiKey) {
  if (!geminiKey) return null;
  let content = `${article.title}. ${article.description || ''}`.slice(0, 1500);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Summarize in 2-3 bullet points:\n\n${content}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  const bullets = text.split('\n')
    .filter(l => /^[\s]*[•*\-–—\d]/.test(l))
    .map(l => l.replace(/^[\s]*[•*\-–—]+\s*|\d+[\.\)]\s*/, '').trim())
    .filter(l => l.length > 10);
  return bullets.length > 0 ? bullets.slice(0, 3) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const NEWS_API_KEY = process.env.VITE_NEWS_API_KEY || process.env.NEWS_API_KEY;
  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!NEWS_API_KEY) {
    return res.status(500).json({ error: 'NewsAPI key not configured' });
  }

  const cacheKey = getCacheKey();
  if (isCacheValid(CACHE[cacheKey])) {
    console.log(`Trending cache HIT: ${cacheKey}`);
    return res.status(200).json({ status: 'ok', articles: CACHE[cacheKey].articles, cached: true });
  }

  try {
    const categories = ['technology', 'business', 'general', 'science', 'health', 'sports', 'entertainment'];

    // Fetch all categories in parallel
    const results = await Promise.allSettled(categories.map(cat => fetchCategory(cat, NEWS_API_KEY)));

    const all = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        all.push(...result.value);
      } else {
        console.error('Trending category failed:', result.reason?.message);
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

    // AI summaries for top 5
    if (GEMINI_API_KEY) {
      await Promise.all(top10.slice(0, 5).map(async article => {
        try {
          const summary = await generateSummary(article, GEMINI_API_KEY);
          if (summary) article.summary_points = summary;
        } catch (e) {
          console.error('Summary error:', e.message);
        }
      }));
    }

    CACHE[cacheKey] = { timestamp: Date.now(), articles: top10 };
    return res.status(200).json({ status: 'ok', articles: top10, totalResults: top10.length, cached: false });

  } catch (error) {
    console.error('Trending handler error:', error);
    return res.status(500).json({ error: 'Failed to fetch trending news', message: error.message });
  }
}
