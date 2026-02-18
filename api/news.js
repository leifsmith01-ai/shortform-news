// api/news.js - Vercel Serverless Function
// Fetches news from NewsAPI (primary) + The Guardian (fallback for unsupported countries)
// with Smart Cache (24hr)

const CACHE = {}; // In-memory cache (persists between requests on same instance)

// Countries supported by NewsAPI free tier top-headlines endpoint
const NEWS_API_SUPPORTED_COUNTRIES = new Set([
  'ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn',
  'co', 'cu', 'cz', 'de', 'eg', 'fr', 'gb', 'gr', 'hk', 'hu',
  'id', 'ie', 'il', 'in', 'it', 'jp', 'kr', 'lt', 'lv', 'ma',
  'mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt', 'ro',
  'rs', 'ru', 'sa', 'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw',
  'ua', 'us', 've', 'za'
]);

// Full country name lookup for Guardian search queries (Guardian has no country param)
const COUNTRY_NAMES_FOR_GUARDIAN = {
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

// Helper: generate cache key
function getCacheKey(country, category) {
  const today = new Date().toISOString().split('T')[0];
  return `${today}-${country}-${category}`;
}

// Helper: check if cache is still valid (less than 24 hours old)
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const ageInHours = (Date.now() - cacheEntry.timestamp) / (1000 * 60 * 60);
  return ageInHours < 24;
}

// Helper: fetch from NewsAPI (primary - supported countries only)
async function fetchFromNewsAPI(country, category, apiKey) {
  const categoryMap = {
    technology: 'technology',
    business: 'business',
    science: 'science',
    health: 'health',
    sports: 'sports',
    entertainment: 'entertainment',
    politics: 'general',
    world: 'general'
  };

  const newsApiCategory = categoryMap[category] || 'general';

  const url = `https://newsapi.org/v2/top-headlines?` +
    `country=${country}&` +
    `category=${newsApiCategory}&` +
    `pageSize=10&` +
    `apiKey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI error: ${data.message}`);
  }

  return data.articles || [];
}

// Helper: fetch from The Guardian (fallback for countries not in NewsAPI)
async function fetchFromGuardian(country, category, apiKey) {
  const countryName = COUNTRY_NAMES_FOR_GUARDIAN[country] || country;
  const guardianSection = GUARDIAN_SECTION_MAP[category] || 'news';

  // Search "<Country> <category>" — Guardian has no native country filter
  const searchQuery = category === 'world' ? countryName : `${countryName} ${category}`;

  const params = new URLSearchParams({
    q: searchQuery,
    section: guardianSection,
    'show-fields': 'trailText,thumbnail,byline',
    'page-size': '10',
    'order-by': 'newest',
    'api-key': apiKey || 'test', // 'test' = Guardian anonymous tier (500 calls/day)
  });

  const url = `https://content.guardianapis.com/search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Guardian API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.response?.status !== 'ok') {
    throw new Error(`Guardian API error: ${data.response?.message || 'Unknown error'}`);
  }

  return data.response?.results || [];
}

// Helper: generate AI summary using Gemini
async function generateSummary(article, geminiKey) {
  if (!geminiKey) return null;

  const content = `${article.title}. ${article.description || ''}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Summarize this news article in 2 to 3 short bullet points. Each point should be one brief sentence. Only output the bullet points, nothing else.
• Point 1
• Point 2
• Point 3 (if needed)

Article: ${content}`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500
      }
    })
  });

  if (!response.ok) return null;

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) return null;

  const bullets = text
    .split('\n')
    .filter(line => /^[\s]*[•*\-]/.test(line))
    .map(line => line.replace(/^[\s]*[•*\-]+\s*/, '').trim())
    .filter(Boolean);

  return bullets.length > 0 ? bullets : null;
}

// Helper: format article from NewsAPI format to our app format
function formatArticle(article, country, category) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || '',
    content: article.content || article.description || '',
    url: article.url || '#',
    image: article.urlToImage || `https://source.unsplash.com/800x400/?${category},news`,
    source: article.source?.name || 'Unknown',
    publishedAt: article.publishedAt || new Date().toISOString(),
    country: country,
    category: category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

// Helper: format article from Guardian API format to our app format
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
    country: country,
    category: category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

// Main handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get params from body (POST) or query (GET)
  const { countries, categories, searchQuery } = req.method === 'POST'
    ? req.body
    : req.query;

  const NEWS_API_KEY   = process.env.VITE_NEWS_API_KEY  || process.env.NEWS_API_KEY;
  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY || null; // Optional - falls back to 'test' key

  if (!NEWS_API_KEY) {
    return res.status(500).json({ error: 'NewsAPI key not configured' });
  }

  const countryList  = Array.isArray(countries)  ? countries  : [countries  || 'us'];
  const categoryList = Array.isArray(categories) ? categories : [categories || 'technology'];

  try {
    const allArticles = [];

    for (const country of countryList) {
      for (const category of categoryList) {
        const cacheKey = getCacheKey(country, category);

        // Check cache first
        if (isCacheValid(CACHE[cacheKey])) {
          console.log(`Cache HIT: ${cacheKey}`);
          allArticles.push(...CACHE[cacheKey].articles);
          continue;
        }

        console.log(`Cache MISS: ${cacheKey} - fetching fresh data`);

        let formattedArticles = [];

        if (NEWS_API_SUPPORTED_COUNTRIES.has(country)) {
          // Primary: NewsAPI (supports ~55 countries)
          console.log(`  Source: NewsAPI [${country}/${category}]`);
          try {
            const rawArticles = await fetchFromNewsAPI(country, category, NEWS_API_KEY);
            const validArticles = rawArticles.filter(a =>
              a.title &&
              a.title !== '[Removed]' &&
              a.url !== 'https://removed.com'
            );
            formattedArticles = validArticles.map(a => formatArticle(a, country, category));
          } catch (err) {
            console.error(`  NewsAPI failed for ${country}/${category}:`, err.message);
          }
          // Fall back to Guardian if NewsAPI returned nothing (error or empty - free tier limitation)
          if (formattedArticles.length === 0) {
            console.log(`  NewsAPI returned 0 results for ${country}/${category}, falling back to Guardian`);
            try {
              const results = await fetchFromGuardian(country, category, GUARDIAN_API_KEY);
              formattedArticles = results.map(r => formatGuardianArticle(r, country, category));
            } catch (guardianErr) {
              console.error(`  Guardian fallback also failed for ${country}/${category}:`, guardianErr.message);
              formattedArticles = [];
            }
          }
        } else {
          // Fallback: The Guardian (covers countries not in NewsAPI)
          console.log(`  Source: Guardian [${country}/${category}] (not in NewsAPI)`);
          try {
            const results = await fetchFromGuardian(country, category, GUARDIAN_API_KEY);
            formattedArticles = results.map(r => formatGuardianArticle(r, country, category));
          } catch (err) {
            console.error(`  Guardian failed for ${country}/${category}:`, err.message);
            formattedArticles = [];
          }
        }

        // Generate AI summaries for first 3 articles (parallel, keeps well within timeout)
        if (GEMINI_API_KEY && formattedArticles.length > 0) {
          const summaryPromises = formattedArticles.slice(0, 3).map(async (article) => {
            try {
              const summary = await generateSummary(article, GEMINI_API_KEY);
              if (summary) article.summary_points = summary;
            } catch (err) {
              console.error('Summary generation failed:', err.message);
            }
            return article;
          });
          await Promise.all(summaryPromises);
        }

        // Store in cache
        CACHE[cacheKey] = {
          timestamp: Date.now(),
          articles: formattedArticles
        };

        allArticles.push(...formattedArticles);
      }
    }

    // Filter by search query if provided
    let filteredArticles = allArticles;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredArticles = allArticles.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    filteredArticles.sort((a, b) =>
      new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    return res.status(200).json({
      status: 'ok',
      articles: filteredArticles,
      totalResults: filteredArticles.length,
      cached: false
    });

  } catch (error) {
    console.error('News fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch news',
      message: error.message
    });
  }
}
