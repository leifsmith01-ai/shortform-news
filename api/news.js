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

// Keywords/demonyms for relevance filtering — articles must mention at least one term
const COUNTRY_RELEVANCE_KEYWORDS = {
  us: ['united states', 'america', 'american', ' u.s.'],
  gb: ['united kingdom', 'britain', 'british', ' uk ', 'england', 'scotland', 'wales'],
  au: ['australia', 'australian'],
  ca: ['canada', 'canadian'],
  de: ['germany', 'german'],
  fr: ['france', 'french'],
  jp: ['japan', 'japanese'],
  cn: ['china', 'chinese'],
  in: ['india', 'indian'],
  kr: ['korea', 'korean', 'south korea'],
  br: ['brazil', 'brazilian'],
  mx: ['mexico', 'mexican'],
  it: ['italy', 'italian'],
  es: ['spain', 'spanish'],
  nl: ['netherlands', 'dutch'],
  se: ['sweden', 'swedish'],
  no: ['norway', 'norwegian'],
  pl: ['poland', 'polish'],
  ch: ['switzerland', 'swiss'],
  be: ['belgium', 'belgian'],
  at: ['austria', 'austrian'],
  ie: ['ireland', 'irish'],
  pt: ['portugal', 'portuguese'],
  dk: ['denmark', 'danish'],
  fi: ['finland', 'finnish'],
  gr: ['greece', 'greek'],
  nz: ['new zealand'],
  sg: ['singapore'],
  hk: ['hong kong'],
  tw: ['taiwan'],
  za: ['south africa'],
  ng: ['nigeria', 'nigerian'],
  eg: ['egypt', 'egyptian'],
  ke: ['kenya', 'kenyan'],
  tr: ['turkey', 'turkish'],
  il: ['israel', 'israeli'],
  ae: ['uae', 'emirates'],
  sa: ['saudi', 'saudi arabia'],
  ar: ['argentina', 'argentinian'],
  cl: ['chile', 'chilean'],
  co: ['colombia', 'colombian'],
  id: ['indonesia', 'indonesian'],
  th: ['thailand', 'thai'],
  my: ['malaysia', 'malaysian'],
  ph: ['philippines', 'philippine'],
  vn: ['vietnam', 'vietnamese'],
  pk: ['pakistan', 'pakistani'],
};

function getCountryTerms(country) {
  if (COUNTRY_RELEVANCE_KEYWORDS[country]) return COUNTRY_RELEVANCE_KEYWORDS[country];
  const name = COUNTRY_NAMES[country];
  return name ? [name.toLowerCase()] : [country.toLowerCase()];
}

function articleMentionsCountry(article, country) {
  const terms = getCountryTerms(country);
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  return terms.some(term => text.includes(term));
}

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
  // For politics + specific country, use /v2/everything with a targeted query
  // because top-headlines 'general' is too broad and often misses political news
  if (category === 'politics' && country !== 'world') {
    const countryName = COUNTRY_NAMES[country] || country;
    const query = `"${countryName}" AND (politics OR government OR election OR parliament OR president OR minister OR policy OR legislation OR senate OR congress OR political)`;
    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '10',
      apiKey,
    });
    const url = `https://newsapi.org/v2/everything?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NewsAPI politics error: ${response.status}`);
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(`NewsAPI politics error: ${data.message}`);
    return data.articles || [];
  }

  const categoryMap = {
    technology: 'technology', business: 'business', science: 'science',
    health: 'health', sports: 'sports', entertainment: 'entertainment',
    politics: 'general', world: 'general'
  };
  const newsApiCategory = categoryMap[category] || 'general';
  const url = country === 'world'
    ? `https://newsapi.org/v2/top-headlines?language=en&category=${newsApiCategory}&pageSize=10&apiKey=${apiKey}`
    : `https://newsapi.org/v2/top-headlines?country=${country}&category=${newsApiCategory}&pageSize=10&apiKey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NewsAPI error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI error: ${data.message}`);
  return data.articles || [];
}

// Helper: fetch from WorldNewsAPI (secondary - broad country coverage)
async function fetchFromWorldNewsAPI(country, category, apiKey) {
  const topic = WORLD_NEWS_TOPIC_MAP[category] || 'politics';
  const params = new URLSearchParams({
    'language': 'en',
    'number': '10',
    'sort': 'publish-time',
    'sort-direction': 'DESC',
    'api-key': apiKey,
  });
  if (country !== 'world') {
    const countryName = COUNTRY_NAMES[country] || country;
    params.set('source-country', country);
    // For politics, use targeted political terms for much better relevance
    if (category === 'politics') {
      params.set('text', `${countryName} politics government`);
    } else {
      params.set('text', `${countryName} ${category !== 'world' ? category : ''}`.trim());
    }
  }
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
    'category': newsDataCategory,
    'language': 'en',
    'apikey': apiKey,
  });
  if (country !== 'world') params.set('country', country);
  const url = `https://newsdata.io/api/1/latest?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NewsData error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(`NewsData error: ${data.message}`);
  return data.results || [];
}

// Helper: fetch from The Guardian (final fallback)
async function fetchFromGuardian(country, category, apiKey) {
  const categorySection = GUARDIAN_SECTION_MAP[category] || 'news';
  let params;
  if (country === 'world') {
    // No country restriction — fetch by category section only
    params = new URLSearchParams({
      section: categorySection,
      'show-fields': 'trailText,thumbnail,byline,bodyText',
      'page-size': '10',
      'order-by': 'newest',
      'api-key': apiKey || 'test',
    });
  } else {
    const countrySection = GUARDIAN_COUNTRY_SECTIONS[country];
    if (countrySection) {
      const queryParams = {
        section: countrySection,
        'show-fields': 'trailText,thumbnail,byline,bodyText',
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
        'show-fields': 'trailText,thumbnail,byline,bodyText',
        'page-size': '10',
        'order-by': 'newest',
        'api-key': apiKey || 'test',
      });
    }
  }
  const url = `https://content.guardianapis.com/search?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Guardian error: ${response.status}`);
  const data = await response.json();
  if (data.response?.status !== 'ok') throw new Error(`Guardian error: ${data.response?.message}`);
  return data.response?.results || [];
}

// ── Keyword search helpers ─────────────────────────────────────────────────
// These search APIs directly by keyword rather than by country/category top-headlines.

async function searchNewsAPIByKeyword(keyword, apiKey) {
  const params = new URLSearchParams({
    q: keyword, language: 'en', sortBy: 'publishedAt', pageSize: '20', apiKey,
  });
  const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
  if (!response.ok) throw new Error(`NewsAPI keyword error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI keyword error: ${data.message}`);
  return data.articles || [];
}

async function searchWorldNewsAPIByKeyword(keyword, apiKey) {
  const params = new URLSearchParams({
    text: keyword, language: 'en', number: '20',
    sort: 'publish-time', 'sort-direction': 'DESC', 'api-key': apiKey,
  });
  const response = await fetch(`https://api.worldnewsapi.com/search-news?${params}`);
  if (!response.ok) throw new Error(`WorldNewsAPI keyword error: ${response.status}`);
  const data = await response.json();
  return data.news || [];
}

async function searchNewsDataByKeyword(keyword, apiKey) {
  const params = new URLSearchParams({ q: keyword, language: 'en', apikey: apiKey });
  const response = await fetch(`https://newsdata.io/api/1/latest?${params}`);
  if (!response.ok) throw new Error(`NewsData keyword error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(`NewsData keyword error: ${data.message}`);
  return data.results || [];
}

async function searchGuardianByKeyword(keyword, apiKey) {
  const params = new URLSearchParams({
    q: keyword, 'show-fields': 'trailText,thumbnail,byline,bodyText',
    'page-size': '20', 'order-by': 'newest', 'api-key': apiKey || 'test',
  });
  const response = await fetch(`https://content.guardianapis.com/search?${params}`);
  if (!response.ok) throw new Error(`Guardian keyword error: ${response.status}`);
  const data = await response.json();
  if (data.response?.status !== 'ok') throw new Error(`Guardian keyword error: ${data.response?.message}`);
  return data.response?.results || [];
}

// ── AI Summarisation — multi-provider fallback chain ─────────────────────────
// Order: Gemini → Groq → OpenAI → Cohere
// Each provider throws QuotaExceededError on 429/quota so the next is tried.

class QuotaExceededError extends Error {
  constructor(provider) {
    super(`${provider} quota exceeded`);
    this.name = 'QuotaExceededError';
  }
}

const SUMMARY_PROMPT = (content) =>
  `You are a factual news summarizer. Based ONLY on the provided article text, write 2-3 concise bullet points covering the key facts. Do NOT add information that is not in the text.\n\n• Key point 1\n• Key point 2\n• Key point 3 (if warranted)\n\nArticle:\n${content}`;

// Shared: prepare article text (strip truncation markers, cap length)
function prepareArticleContent(article) {
  let content = (article.content && article.content.length > (article.description || '').length)
    ? article.content
    : `${article.title}. ${article.description || ''}`;
  content = content.replace(/\s*\[\+\d+ chars\].*$/s, '').trim();
  if (!content.toLowerCase().includes(article.title.slice(0, 20).toLowerCase())) {
    content = `${article.title}. ${content}`;
  }
  return content.slice(0, 3000);
}

// Shared: extract bullet points from any LLM response text
function parseBullets(text) {
  if (!text) return null;
  let bullets = text.split('\n')
    .filter(line => /^[\s]*[•*\-–—]/.test(line))
    .map(line => line.replace(/^[\s]*[•*\-–—]+\s*/, '').trim())
    .filter(Boolean);
  if (bullets.length === 0) {
    bullets = text.split('\n')
      .map(line => line.replace(/^[\s]*\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length > 15);
  }
  return bullets.length > 0 ? bullets.slice(0, 3) : null;
}

async function summarizeWithGemini(content, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SUMMARY_PROMPT(content) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
    })
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.code === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
    throw new QuotaExceededError('Gemini');
  }
  if (!res.ok) { console.error(`Gemini error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseBullets(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function summarizeWithGroq(content, key) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: SUMMARY_PROMPT(content) }],
      temperature: 0.2,
      max_tokens: 500
    })
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.code === 'rate_limit_exceeded') {
    throw new QuotaExceededError('Groq');
  }
  if (!res.ok) { console.error(`Groq error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseBullets(data.choices?.[0]?.message?.content);
}

async function summarizeWithOpenAI(content, key) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: SUMMARY_PROMPT(content) }],
      temperature: 0.2,
      max_tokens: 500
    })
  });
  const data = await res.json();
  if (res.status === 429 || data.error?.type === 'insufficient_quota' || data.error?.type === 'rate_limit_exceeded') {
    throw new QuotaExceededError('OpenAI');
  }
  if (!res.ok) { console.error(`OpenAI error: ${data.error?.message?.slice(0, 100)}`); return null; }
  return parseBullets(data.choices?.[0]?.message?.content);
}

async function summarizeWithCohere(content, key) {
  const res = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'command-r-08-2024',
      messages: [{ role: 'user', content: SUMMARY_PROMPT(content) }],
      temperature: 0.2,
      max_tokens: 500
    })
  });
  const data = await res.json();
  if (res.status === 429) { throw new QuotaExceededError('Cohere'); }
  if (!res.ok) { console.error(`Cohere error: ${JSON.stringify(data).slice(0, 100)}`); return null; }
  return parseBullets(data.message?.content?.[0]?.text);
}

// Main: try each configured provider in order; skip to next on quota exhaustion
async function generateSummary(article, llmKeys) {
  const content = prepareArticleContent(article);
  const providers = [
    llmKeys.gemini && (() => summarizeWithGemini(content, llmKeys.gemini)),
    llmKeys.groq   && (() => summarizeWithGroq(content, llmKeys.groq)),
    llmKeys.openai && (() => summarizeWithOpenAI(content, llmKeys.openai)),
    llmKeys.cohere && (() => summarizeWithCohere(content, llmKeys.cohere)),
  ].filter(Boolean);

  for (const attempt of providers) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn(`[summary] ${err.message} — trying next provider`);
        continue;
      }
      console.error('[summary] unexpected error:', err.message);
    }
  }
  return null;
}

// Helper: human-readable time ago (e.g. "2h ago", "3d ago")
function timeAgo(dateStr) {
  if (!dateStr) return 'Today';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Formatters — normalise each API's shape to our app format
function formatNewsAPIArticle(article, country, category) {
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
    image_url: article.image || null,
    source: article.source_country ? `World News (${article.source_country.toUpperCase()})` : 'World News API',
    publishedAt: article.publish_date || new Date().toISOString(),
    time_ago: timeAgo(article.publish_date),
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
    image_url: article.image_url || null,
    source: article.source_id || 'NewsData',
    publishedAt: article.pubDate || new Date().toISOString(),
    time_ago: timeAgo(article.pubDate),
    country, category,
    views: Math.floor(Math.random() * 5000) + 100,
    summary_points: null
  };
}

function formatGuardianArticle(result, country, category) {
  const fields = result.fields || {};
  // bodyText is the full article body; trailText is a short teaser
  const bodyText = fields.bodyText ? fields.bodyText.slice(0, 3000) : '';
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: result.webTitle || 'No title',
    description: fields.trailText || '',
    content: bodyText || fields.trailText || '',
    url: result.webUrl || '#',
    image_url: fields.thumbnail || null,
    source: 'The Guardian',
    publishedAt: result.webPublicationDate || new Date().toISOString(),
    time_ago: timeAgo(result.webPublicationDate),
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
  const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY   || null;
  const NEWS_DATA_API_KEY  = process.env.NEWS_DATA_API_KEY    || null;

  // LLM summarisation — collect all configured keys; generateSummary tries them in order
  const LLM_KEYS = {
    gemini: process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || null,
    groq:   process.env.GROQ_API_KEY   || null,
    openai: process.env.OPENAI_API_KEY || null,
    cohere: process.env.COHERE_API_KEY || null,
  };
  const HAS_LLM = Object.values(LLM_KEYS).some(Boolean);

  if (!NEWS_API_KEY) return res.status(500).json({ error: 'NewsAPI key not configured' });

  // ── Keyword search: search APIs directly when a searchQuery is provided ────
  // This replaces the top-headlines + post-filter approach with a real search
  // so results are actually about the keyword, not just top news that mentions it.
  if (searchQuery) {
    const keyword = searchQuery.trim();
    console.log(`Keyword search: "${keyword}"`);
    try {
      const results = [];

      // 1. NewsAPI /v2/everything (supports full-text keyword search)
      try {
        const raw = await searchNewsAPIByKeyword(keyword, NEWS_API_KEY);
        const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
        results.push(...valid.map(a => formatNewsAPIArticle(a, 'world', 'world')));
        console.log(`  [1] NewsAPI keyword: ${valid.length} articles`);
      } catch (err) {
        console.error('  NewsAPI keyword search failed:', err.message);
      }

      // 2. WorldNewsAPI
      if (results.length < 10 && WORLD_NEWS_API_KEY) {
        try {
          const raw = await searchWorldNewsAPIByKeyword(keyword, WORLD_NEWS_API_KEY);
          results.push(...raw.map(a => formatWorldNewsAPIArticle(a, 'world', 'world')));
          console.log(`  [2] WorldNewsAPI keyword: ${raw.length} articles`);
        } catch (err) {
          console.error('  WorldNewsAPI keyword search failed:', err.message);
        }
      }

      // 3. NewsData.io
      if (results.length < 10 && NEWS_DATA_API_KEY) {
        try {
          const raw = await searchNewsDataByKeyword(keyword, NEWS_DATA_API_KEY);
          const valid = raw.filter(a => a.title);
          results.push(...valid.map(a => formatNewsDataArticle(a, 'world', 'world')));
          console.log(`  [3] NewsData keyword: ${valid.length} articles`);
        } catch (err) {
          console.error('  NewsData keyword search failed:', err.message);
        }
      }

      // 4. Guardian (fallback)
      if (results.length < 5 && GUARDIAN_API_KEY) {
        try {
          const raw = await searchGuardianByKeyword(keyword, GUARDIAN_API_KEY);
          results.push(...raw.map(r => formatGuardianArticle(r, 'world', 'world')));
          console.log(`  [4] Guardian keyword: ${raw.length} articles`);
        } catch (err) {
          console.error('  Guardian keyword search failed:', err.message);
        }
      }

      // AI summaries for first 5 (tries all configured LLM providers in order)
      if (HAS_LLM && results.length > 0) {
        await Promise.all(results.slice(0, 5).map(async (article) => {
          try {
            const summary = await generateSummary(article, LLM_KEYS);
            if (summary) article.summary_points = summary;
          } catch (err) {
            console.error('Summary failed:', err.message);
          }
        }));
      }

      // Sort newest first, deduplicate by title
      const seen = new Set();
      const deduped = results
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .filter(a => {
          const key = a.title.toLowerCase().slice(0, 60);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      return res.status(200).json({ status: 'ok', articles: deduped, totalResults: deduped.length, cached: false });
    } catch (error) {
      console.error('Keyword search error:', error);
      return res.status(500).json({ error: 'Failed to search news', message: error.message });
    }
  }

  // ── Trending: fetch across all categories for 'world' and return top 10 by views ──
  const isTrending = Array.isArray(categories)
    ? categories.includes('trending')
    : categories === 'trending';

  if (isTrending) {
    const trendingCategories = ['technology', 'business', 'politics', 'science', 'health', 'sports', 'entertainment'];
    const trendingCacheKey = getCacheKey('world', 'trending');

    if (isCacheValid(CACHE[trendingCacheKey])) {
      console.log(`Cache HIT: ${trendingCacheKey}`);
      return res.status(200).json({ status: 'ok', articles: CACHE[trendingCacheKey].articles, totalResults: CACHE[trendingCacheKey].articles.length, cached: true });
    }

    try {
      console.log('Fetching trending articles across all categories (parallel)');

      // Fetch all categories in parallel to avoid serverless timeout
      const categoryResults = await Promise.allSettled(
        trendingCategories.map(async (cat) => {
          const catCacheKey = getCacheKey('world', cat);
          if (isCacheValid(CACHE[catCacheKey])) {
            return CACHE[catCacheKey].articles;
          }
          const raw = await fetchFromNewsAPI('world', cat, NEWS_API_KEY);
          const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
          const formatted = valid.map(a => formatNewsAPIArticle(a, 'world', cat));
          CACHE[catCacheKey] = { timestamp: Date.now(), articles: formatted };
          return formatted;
        })
      );

      const trendingArticles = [];
      for (const result of categoryResults) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          trendingArticles.push(...result.value);
        } else if (result.status === 'rejected') {
          console.error('Trending category fetch failed:', result.reason?.message);
        }
      }

      if (trendingArticles.length === 0) {
        return res.status(200).json({ status: 'ok', articles: [], totalResults: 0, cached: false });
      }

      // Deduplicate by title, sort by newest first, take top 10
      const seen = new Set();
      const top10 = trendingArticles
        .filter(a => {
          const key = a.title.toLowerCase().slice(0, 60);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 10);

      // Generate AI summaries for the top 5
      if (GEMINI_API_KEY && top10.length > 0) {
        await Promise.all(top10.slice(0, 5).map(async (article) => {
          try {
            const summary = await generateSummary(article, GEMINI_API_KEY);
            if (summary) article.summary_points = summary;
          } catch (err) {
            console.error('Trending summary failed:', err.message);
          }
        }));
      }

      CACHE[trendingCacheKey] = { timestamp: Date.now(), articles: top10 };
      return res.status(200).json({ status: 'ok', articles: top10, totalResults: top10.length, cached: false });
    } catch (error) {
      console.error('Trending fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch trending news', message: error.message });
    }
  }

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

        // ── 1. NewsAPI (primary, ~55 countries + world) ──────────────────────────────
        if (country === 'world' || NEWS_API_SUPPORTED_COUNTRIES.has(country)) {
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
        if (formattedArticles.length < 5 && WORLD_NEWS_API_KEY && (country === 'world' || WORLD_NEWS_API_SUPPORTED_COUNTRIES.has(country))) {
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
        if (formattedArticles.length < 5 && NEWS_DATA_API_KEY && (country === 'world' || NEWS_DATA_SUPPORTED_COUNTRIES.has(country))) {
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

        // ── AI summaries for first 5 articles (tries all configured LLM providers) ──
        if (HAS_LLM && formattedArticles.length > 0) {
          const summaryPromises = formattedArticles.slice(0, 5).map(async (article) => {
            try {
              const summary = await generateSummary(article, LLM_KEYS);
              if (summary) article.summary_points = summary;
            } catch (err) {
              console.error('Summary failed:', err.message);
            }
            return article;
          });
          await Promise.all(summaryPromises);
        }

        // ── Relevance filter: only keep articles that mention the country ──────
        // This removes off-topic articles (e.g. global tech news surfaced by an AU source).
        // Falls back to all articles if fewer than 3 would remain after filtering.
        if (country !== 'world' && formattedArticles.length > 0) {
          const relevant = formattedArticles.filter(a => articleMentionsCountry(a, country));
          if (relevant.length >= 3) formattedArticles = relevant;
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
