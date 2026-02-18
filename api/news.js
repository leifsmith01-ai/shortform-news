// api/news.js - Vercel Serverless Function
// Sources: NewsAPI (primary) → WorldNewsAPI → NewsData.io → The Guardian (fallback)
// Cache: 12-hour TTL (articles refresh twice a day)

const CACHE = {}; // In-memory cache (persists between requests on same instance)

const CACHE_TTL_HOURS = 12; // Refresh articles twice a day

// Countries supported by NewsAPI free tier top-headlines endpoint
const NEWS_API_SUPPORTED_COUNTRIES = new Set([
  'ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn',
  'co', 'cu', 'cz', 'de', 'eg', 'fr', 'gb', 'gr', 'hk', 'hu',
  'id', 'ie', 'il', 'in', 'it', 'jp', 'kr', 'lt', 'lv', 'ma',
  'mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt', 'ro',
  'rs', 'ru', 'sa', 'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw',
  'ua', 'us', 've', 'za'
]);

// Countries supported by WorldNewsAPI
const WORLD_NEWS_API_SUPPORTED_COUNTRIES = new Set([
  'us', 'gb', 'ca', 'au', 'in', 'de', 'fr', 'it', 'es', 'nl',
  'br', 'mx', 'ar', 'jp', 'kr', 'cn', 'hk', 'sg', 'nz', 'za',
  'ng', 'ke', 'eg', 'gh', 'tz', 'ug', 'et', 'sn', 'rw',
  'ae', 'sa', 'tr', 'il', 'qa', 'kw',
  'pk', 'bd', 'lk', 'vn', 'th', 'my', 'ph', 'id', 'tw',
  'pl', 'se', 'no', 'dk', 'fi', 'ch', 'at', 'be', 'pt', 'gr',
  'cz', 'ro', 'hu', 'ua'
]);

// Countries supported by NewsData.io (very broad coverage)
const NEWS_DATA_SUPPORTED_COUNTRIES = new Set([
  'us', 'gb', 'ca', 'au', 'in', 'de', 'fr', 'it', 'es', 'nl',
  'br', 'mx', 'ar', 'cl', 'co', 'pe', 'jp', 'kr', 'cn', 'hk',
  'sg', 'tw', 'id', 'th', 'my', 'ph', 'vn', 'pk', 'bd',
  'za', 'ng', 'ke', 'eg', 'gh', 'et', 'tz', 'ug', 'sn',
  'ae', 'sa', 'tr', 'il', 'qa', 'kw', 'jo', 'lb',
  'pl', 'se', 'no', 'dk', 'fi', 'ch', 'at', 'be', 'pt', 'gr',
  'cz', 'ro', 'hu', 'ua', 'nz', 'ru',
  'cu', 'jm', 'cr', 'pa', 'do', 'gt', 'hn', 'ec', 'uy', 'py', 'bo', 've',
  'ma', 'dz', 'tn', 'rw', 'cm', 'ci',
  'mm', 'kh', 'np', 'lk', 'fj', 'pg',
  'ir', 'iq', 'bh', 'om', 'lu', 'ie', 'rs', 'hr', 'bg', 'sk', 'lt', 'lv', 'ee', 'is'
]);

// Full country name lookup for Guardian/WorldNewsAPI search queries
const COUNTRY_NAMES = {
  us: 'United States', ca: 'Canada', mx: 'Mexico', cu: 'Cuba',
  jm: 'Jamaica', cr: 'Costa Rica', pa: 'Panama', do: 'Dominican Republic',
  gt: 'Guatemala', hn: 'Honduras',
  br: 'Brazil', ar: 'Argentina', cl: 'Chile', co: 'Colombia', pe: 'Peru',
  ve: 'Venezuela', ec: 'Ecuador', uy: 'Uruguay', py: 'Paraguay', bo: 'Bolivia',
  gb: 'United Kingdom', de: 'Germany', fr: 'France', it: 'Italy', es: 'Spain',
  nl: 'Netherlands', se: 'Sweden', no: 'Norway', pl: 'Poland', ch: 'Switzerland',
  be: 'Belgium', at: 'Austria', ie: 'Ireland', pt: 'Portugal', dk: 'Denmark',
  fi: 'Finland', gr: 'Greece', cz: 'Czech Republic', ro: 'Romania', hu: 'Hungary',
  ua: 'Ukraine', rs: 'Serbia', hr: 'Croatia', bg: 'Bulgaria', sk: 'Slovakia',
  lt: 'Lithuania', lv: 'Latvia', ee: 'Estonia', is: 'Iceland', lu: 'Luxembourg',
  cn: 'China', jp: 'Japan', in: 'India', kr: 'South Korea', sg: 'Singapore',
  hk: 'Hong Kong', tw: 'Taiwan', id: 'Indonesia', th: 'Thailand', my: 'Malaysia',
  ph: 'Philippines', vn: 'Vietnam', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka',
  mm: 'Myanmar', kh: 'Cambodia', np: 'Nepal',
  il: 'Israel', ae: 'UAE', sa: 'Saudi Arabia', tr: 'Turkey', qa: 'Qatar',
  kw: 'Kuwait', bh: 'Bahrain', om: 'Oman', jo: 'Jordan', lb: 'Lebanon',
  iq: 'Iraq', ir: 'Iran',
  za: 'South Africa', ng: 'Nigeria', eg: 'Egypt', ke: 'Kenya', ma: 'Morocco',
  gh: 'Ghana', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', sn: 'Senegal',
  ci: 'Ivory Coast', cm: 'Cameroon', dz: 'Algeria', tn: 'Tunisia', rw: 'Rwanda',
  au: 'Australia', nz: 'New Zealand', fj: 'Fiji', pg: 'Papua New Guinea',
};

// Map app categories to Guardian API sections
const GUARDIAN_SECTION_MAP = {
  technology:    'technology',
  business:      'business',
  science:       'science',
  health:        'society',
  sports:        'sport',
  entertainment: 'culture',
  politics:      'politics',
  world:         'world'
};

// Guardian native country sections
const GUARDIAN_COUNTRY_SECTIONS = {
  au: 'australia-news',
  gb: 'uk-news',
  us: 'us-news',
};

// Map app categories to WorldNewsAPI topics
const WORLD_NEWS_TOPIC_MAP = {
  technology:    'technology',
  business:      'business',
  science:       'science',
  health:        'health',
  sports:        'sports',
  entertainment: 'entertainment',
  politics:      'politics',
  world:         'politics'  // closest match
};

// Map app categories to NewsData.io categories
const NEWS_DATA_CATEGORY_MAP = {
  technology:    'technology',
  business:      'business',
  science:       'science',
  health:        'health',
  sports:        'sports',
  entertainment: 'entertainment',
  politics:      'politics',
  world:         'world'
};

// Helper: generate cache key (slot = "am" or "pm" to refresh twice a day)
function getCacheKey(country, category) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const slot = now.getUTCHours() < 12 ? 'am' : 'pm';
  return `${date}-${slot}-${country}-${category}`;
}

// Helper: check if cache is still valid
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const ageInHours = (Date.now() - cacheEntry.timestamp) / (1000 * 60 * 60);
  return ageInHours < CACHE_TTL_HOURS;
}

// Helper: fetch from NewsAPI (primary - ~55 countries)
async function fetchFromNewsAPI(country, category, apiKey) {
  const categoryMap = {
    technology: 'technology', business: 'business', science: 'science',
    health: 'health', sports: 'sports', entertainment: 'entertainment',
    politics: 'general', world: 'general'
  };
  const newsApiCategory = categoryMap[category] || 'general';
  const url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${newsApiCategory}&pageSize=10&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NewsAPI error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI error: ${data.message}`);
  return data.articles || [];
}

// Helper: fetch from WorldNewsAPI (secondary - broad country coverage)
async function fetchFromWorldNewsAPI(country, category, apiKey) {
  const topic = WORLD_NEWS_TOPIC_MAP[category] || 'politics';
  const countryName = COUNTRY_NAMES[country] || country;
  const params = new URLSearchParams({
    'source-country': country,
    'text': `${countryName} ${category !== 'world' ? category : ''}`.trim(),
    'language': 'en',
    'number': '10',
    'sort': 'publish-time',
    'sort-direction': 'DESC',
    'api-key': apiKey,
  });
  // topic filter improves precision
  if (topic) params.set('categories', topic);

  const url = `https://api.worldnewsapi.com/search-news?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`WorldNewsAPI error: ${response.status}`);
  const data = await response.json();
  return data.news || [];
}

// Helper: fetch from NewsData.io (tertiary - very broad coverage)
async function fetchFromNewsData(country, category, apiKey) {
  const newsDataCategory = NEWS_DATA_CATEGORY_MAP[category] || 'politics';
  const params = new URLSearchParams({
    'country': country,
    'category': newsDataCategory,
    'language': 'en',
    'apikey': apiKey,
  });
  const url = `https://newsdata.io/api/1/latest?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NewsData error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(`NewsData error: ${data.message}`);
  return data.results || [];
}

// Helper: fetch from The Guardian (final fallback)
async function fetchFromGuardian(country, category, apiKey) {
  const countrySection = GUARDIAN_COUNTRY_SECTIONS[country];
  const categorySection = GUARDIAN_SECTION_MAP[category] || 'news';
  let params;
  if (countrySection) {
    const queryParams = {
      section: countrySection,
      'show-fields': 'trailText,thumbnail,byline',
      'page-size': '10',
      'order-by': 'newest',
      'api-key': apiKey || 'test',
    };
    if (category !== 'world') queryParams.q = category;
    params = new URLSearchParams(queryParams);
  } else {
    const countryName = COUNTRY_NAMES[country] || country;
    const searchQuery = category === 'world' ? countryName : `${countryName} ${category}`;
    params = new URLSearchParams({
      q: searchQuery,
      section: categorySection,
      'show-fields': 'trailText,thumbnail,byline',
      'page-size': '10',
      'order-by': 'newest',
      'api-key': apiKey || 'test',
    });
  }
  const url = `https://content.guardianapis.com/search?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Guardian error: ${response.status}`);
  const data = await response.json();
  if (data.response?.status !== 'ok') throw new Error(`Guardian error: ${data.response?.message}`);
  return data.response?.results || [];
}

// Helper: generate AI summary using Gemini
async function generateSummary(article, geminiKey) {
  if (!geminiKey) return null;
  const content = `${article.title}. ${article.description || ''}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Summarize this news article in 2 to 3 short bullet points. Each point should be one brief sentence. Only output the bullet points, nothing else.\n• Point 1\n• Point 2\n• Point 3 (if needed)\n\nArticle: ${content}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
    })
  });
  const data = await response.json();
  if (!response.ok) { console.error(`Gemini error: ${data.error?.message?.slice(0, 100)}`); return null; }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  const bullets = text.split('\n')
    .filter(line => /^[\s]*[•*\-]/.test(line))
    .map(line => line.replace(/^[\s]*[•*\-]+\s*/, '').trim())
    .filter(Boolean);
  return bullets.length > 0 ? bullets : null;
}

// Formatters — normalise each API's shape to our app format
function formatNewsAPIArticle(article, country, category) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || '',
    content: article.content || article.description || '',
    url: article.url || '#',
    image: article.urlToImage || `https://source.unsplash.com/800x400/?${category},news`,
    source: article.source?.name || 'Unknown',
    publishedAt: article.publishedAt || new Date().toISOString(),
    country, category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

function formatWorldNewsAPIArticle(article, country, category) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.text ? article.text.slice(0, 200) : '',
    content: article.text || '',
    url: article.url || '#',
    image: article.image || `https://source.unsplash.com/800x400/?${category},news`,
    source: article.source_country ? `World News (${article.source_country.toUpperCase()})` : 'World News API',
    publishedAt: article.publish_date || new Date().toISOString(),
    country, category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

function formatNewsDataArticle(article, country, category) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || article.content?.slice(0, 200) || '',
    content: article.content || article.description || '',
    url: article.link || '#',
    image: article.image_url || `https://source.unsplash.com/800x400/?${category},news`,
    source: article.source_id || 'NewsData',
    publishedAt: article.pubDate || new Date().toISOString(),
    country, category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

function formatGuardianArticle(result, country, category) {
  const fields = result.fields || {};
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: result.webTitle || 'No title',
    description: fields.trailText || '',
    content: fields.trailText || '',
    url: result.webUrl || '#',
    image: fields.thumbnail || `https://source.unsplash.com/800x400/?${category},news`,
    source: 'The Guardian',
    publishedAt: result.webPublicationDate || new Date().toISOString(),
    country, category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

// Main handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { countries, categories, searchQuery } = req.method === 'POST' ? req.body : req.query;

  const NEWS_API_KEY       = process.env.VITE_NEWS_API_KEY    || process.env.NEWS_API_KEY;
  const GUARDIAN_API_KEY   = process.env.GUARDIAN_API_KEY     || null;
  const GEMINI_API_KEY     = process.env.VITE_GEMINI_API_KEY  || process.env.GEMINI_API_KEY;
  const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY   || null;
  const NEWS_DATA_API_KEY  = process.env.NEWS_DATA_API_KEY    || null;

  if (!NEWS_API_KEY) return res.status(500).json({ error: 'NewsAPI key not configured' });

  const countryList  = Array.isArray(countries)  ? countries  : [countries  || 'us'];
  const categoryList = Array.isArray(categories) ? categories : [categories || 'technology'];

  try {
    const allArticles = [];

    for (const country of countryList) {
      for (const category of categoryList) {
        const cacheKey = getCacheKey(country, category);

        if (isCacheValid(CACHE[cacheKey])) {
          console.log(`Cache HIT: ${cacheKey}`);
          allArticles.push(...CACHE[cacheKey].articles);
          continue;
        }

        console.log(`Cache MISS: ${cacheKey} — fetching fresh data`);
        let formattedArticles = [];

        // ── 1. NewsAPI (primary, ~55 countries) ──────────────────────────────
        if (NEWS_API_SUPPORTED_COUNTRIES.has(country)) {
          console.log(`  [1] NewsAPI [${country}/${category}]`);
          try {
            const raw = await fetchFromNewsAPI(country, category, NEWS_API_KEY);
            const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
            formattedArticles = valid.map(a => formatNewsAPIArticle(a, country, category));
          } catch (err) {
            console.error(`  NewsAPI failed:`, err.message);
          }
        }

        // ── 2. WorldNewsAPI (secondary, very broad) ───────────────────────────
        if (formattedArticles.length < 5 && WORLD_NEWS_API_KEY && WORLD_NEWS_API_SUPPORTED_COUNTRIES.has(country)) {
          console.log(`  [2] WorldNewsAPI [${country}/${category}] (have ${formattedArticles.length} so far)`);
          try {
            const raw = await fetchFromWorldNewsAPI(country, category, WORLD_NEWS_API_KEY);
            const extra = raw.map(a => formatWorldNewsAPIArticle(a, country, category));
            formattedArticles = [...formattedArticles, ...extra].slice(0, 15);
          } catch (err) {
            console.error(`  WorldNewsAPI failed:`, err.message);
          }
        }

        // ── 3. NewsData.io (tertiary, broadest coverage) ──────────────────────
        if (formattedArticles.length < 5 && NEWS_DATA_API_KEY && NEWS_DATA_SUPPORTED_COUNTRIES.has(country)) {
          console.log(`  [3] NewsData.io [${country}/${category}] (have ${formattedArticles.length} so far)`);
          try {
            const raw = await fetchFromNewsData(country, category, NEWS_DATA_API_KEY);
            const valid = raw.filter(a => a.title && a.title !== '[Removed]');
            const extra = valid.map(a => formatNewsDataArticle(a, country, category));
            formattedArticles = [...formattedArticles, ...extra].slice(0, 15);
          } catch (err) {
            console.error(`  NewsData failed:`, err.message);
          }
        }

        // ── 4. The Guardian (final fallback) ──────────────────────────────────
        if (formattedArticles.length < 3) {
          console.log(`  [4] Guardian fallback [${country}/${category}]`);
          try {
            const results = await fetchFromGuardian(country, category, GUARDIAN_API_KEY);
            const extra = results.map(r => formatGuardianArticle(r, country, category));
            formattedArticles = [...formattedArticles, ...extra].slice(0, 15);
          } catch (err) {
            console.error(`  Guardian failed:`, err.message);
          }
        }

        // ── AI summaries for first 3 articles ─────────────────────────────────
        if (GEMINI_API_KEY && formattedArticles.length > 0) {
          const summaryPromises = formattedArticles.slice(0, 3).map(async (article) => {
            try {
              const summary = await generateSummary(article, GEMINI_API_KEY);
              if (summary) article.summary_points = summary;
            } catch (err) {
              console.error('Summary failed:', err.message);
            }
            return article;
          });
          await Promise.all(summaryPromises);
        }

        CACHE[cacheKey] = { timestamp: Date.now(), articles: formattedArticles };
        allArticles.push(...formattedArticles);
      }
    }

    // Filter by search query
    let filteredArticles = allArticles;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredArticles = allArticles.filter(a =>
        a.title.toLowerCase().includes(query) ||
        (a.description || '').toLowerCase().includes(query)
      );
    }

    // Sort newest first, deduplicate by title
    const seen = new Set();
    filteredArticles = filteredArticles
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .filter(a => {
        const key = a.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return res.status(200).json({
      status: 'ok',
      articles: filteredArticles,
      totalResults: filteredArticles.length,
      cached: false
    });

  } catch (error) {
    console.error('News fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch news', message: error.message });
  }
}
