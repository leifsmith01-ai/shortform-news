// api/news.js - Vercel Serverless Function
// Sources: NewsAPI (primary) â†’ WorldNewsAPI â†’ NewsData.io â†’ The Guardian (fallback)
// Cache: 30-day article pool with 6-hour refresh interval

import { applyRateLimit } from './lib/rateLimit.js';
import { validateEnv } from './lib/validateEnv.js';
import {
  CACHE, CACHE_TTL_HOURS, CACHE_MAX_ENTRIES, KEYWORD_CACHE_TTL_HOURS,
  getCacheKey, getSourceFingerprint, isCacheValid, evictCacheIfNeeded,
  isRefreshNeeded, mergeArticles,
} from './lib/cache.js';
import { getCache, setCache } from './lib/redisCache.js';
// articleFilter.js and ranking.js provide the canonical, tested implementations
// of the functions below. This file still carries its own inline copies during the
// migration â€” a full cut-over is the next step once integration tests are in place.
// import { ... } from './lib/articleFilter.js';
// import { ... } from './lib/ranking.js';

// Maximum number of articles to generate AI summaries for per request.
// Raising this improves coverage but uses more LLM API quota.
// Override via MAX_SUMMARY_ARTICLES env var (e.g. set to 5 to reduce costs).
const MAX_SUMMARY_ARTICLES = parseInt(process.env.MAX_SUMMARY_ARTICLES || '10', 10);

// API request timeout (ms) â€” prevents a single slow API from blocking the whole response
const API_TIMEOUT_MS = 8000;

// â”€â”€ Daily API call counters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tracks how many calls have been made to each external API today (UTC).
// When any primary API approaches its daily limit, the cache TTL is doubled
// to reduce further fetches. Counters are in-process and reset on cold-start;
// they degrade gracefully (best-effort, not guaranteed cross-instance).
// Override daily limits via env vars to match your subscription tier.
const API_DAILY_LIMITS = {
  newsapi: parseInt(process.env.NEWS_API_DAILY_LIMIT || '100', 10),
  worldnews: parseInt(process.env.WORLDNEWS_DAILY_LIMIT || '500', 10),
  newsdata: parseInt(process.env.NEWSDATA_DAILY_LIMIT || '200', 10),
  guardian: parseInt(process.env.GUARDIAN_DAILY_LIMIT || '5000', 10),
  gnews: parseInt(process.env.GNEWS_DAILY_LIMIT || '100', 10),
  mediastack: parseInt(process.env.MEDIASTACK_DAILY_LIMIT || '16', 10),  // ~500/month free
  currents: parseInt(process.env.CURRENTS_DAILY_LIMIT || '600', 10),     // 600/day free
};
const API_DAILY_COUNTERS = {};

function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

function incrementApiCounter(apiName) {
  const key = `${todayUTC()}-${apiName}`;
  API_DAILY_COUNTERS[key] = (API_DAILY_COUNTERS[key] || 0) + 1;
}

function getApiDailyCount(apiName) {
  return API_DAILY_COUNTERS[`${todayUTC()}-${apiName}`] || 0;
}

/**
 * Returns a TTL in seconds for a cache entry.
 * Doubles the TTL when any primary API has consumed >= 80% of its daily limit.
 */
function getEffectiveCacheTTL() {
  const nearQuota = Object.entries(API_DAILY_LIMITS).some(
    ([api, limit]) => getApiDailyCount(api) >= limit * 0.8
  );
  return nearQuota ? CACHE_TTL_HOURS * 2 * 3600 : undefined;
}

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

// Countries where NewsAPI alone reliably returns 20+ high-quality articles per
// category â€” skip WorldNewsAPI and GNews in the parallel first pass to conserve
// their daily quotas. If post-filter article count still falls below MIN_ARTICLES,
// the post-filter retry automatically calls those APIs as a safety net.
const NEWSAPI_FIRST_PASS_COUNTRIES = new Set(['us', 'gb', 'au', 'ca']);

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
  il: 'Israel', ps: 'Palestine', ae: 'UAE', sa: 'Saudi Arabia', tr: 'Turkey', qa: 'Qatar',
  kw: 'Kuwait', bh: 'Bahrain', om: 'Oman', jo: 'Jordan', lb: 'Lebanon',
  iq: 'Iraq', ir: 'Iran',
  za: 'South Africa', ng: 'Nigeria', eg: 'Egypt', ke: 'Kenya', ma: 'Morocco',
  gh: 'Ghana', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', sn: 'Senegal',
  ci: 'Ivory Coast', cm: 'Cameroon', dz: 'Algeria', tn: 'Tunisia', rw: 'Rwanda',
  au: 'Australia', nz: 'New Zealand', fj: 'Fiji', pg: 'Papua New Guinea',
};

// Trusted news sources â€” single registry used to derive domain and source-ID lists.
// Each entry: { domain, sourceId (NewsAPI ID, nullable), name, group }
const ALL_TRUSTED_SOURCES = [
  // â”€â”€ General / Wire â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'reuters.com', sourceId: 'reuters', name: 'Reuters', group: 'general' },
  { domain: 'bbc.co.uk', sourceId: 'bbc-news', name: 'BBC News', group: 'general' },
  { domain: 'bbc.com', sourceId: null, name: 'BBC (intl)', group: 'general' },
  { domain: 'apnews.com', sourceId: 'associated-press', name: 'Associated Press', group: 'general' },
  { domain: 'theguardian.com', sourceId: 'the-guardian-uk', name: 'The Guardian', group: 'general' },
  { domain: 'abc.net.au', sourceId: 'abc-news-au', name: 'ABC Australia', group: 'general' },
  { domain: 'nytimes.com', sourceId: 'the-new-york-times', name: 'New York Times', group: 'general' },
  { domain: 'washingtonpost.com', sourceId: 'the-washington-post', name: 'Washington Post', group: 'general' },
  { domain: 'aljazeera.com', sourceId: 'al-jazeera-english', name: 'Al Jazeera', group: 'general' },
  { domain: 'npr.org', sourceId: null, name: 'NPR', group: 'general' },
  { domain: 'cnn.com', sourceId: 'cnn', name: 'CNN', group: 'general' },
  { domain: 'abcnews.go.com', sourceId: 'abc-news', name: 'ABC News', group: 'general' },
  { domain: 'cbsnews.com', sourceId: 'cbs-news', name: 'CBS News', group: 'general' },
  { domain: 'nbcnews.com', sourceId: 'nbc-news', name: 'NBC News', group: 'general' },
  { domain: 'pbs.org', sourceId: null, name: 'PBS', group: 'general' },
  { domain: 'theconversation.com', sourceId: null, name: 'The Conversation', group: 'general' },
  { domain: 'axios.com', sourceId: null, name: 'Axios', group: 'general' },
  { domain: 'theatlantic.com', sourceId: 'the-atlantic', name: 'The Atlantic', group: 'general' },
  { domain: 'time.com', sourceId: 'time', name: 'Time', group: 'general' },
  { domain: 'usatoday.com', sourceId: 'usa-today', name: 'USA Today', group: 'general' },
  // â”€â”€ Regional â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'smh.com.au', sourceId: null, name: 'Sydney Morning Herald', group: 'regional' },
  { domain: 'theaustralian.com.au', sourceId: null, name: 'The Australian', group: 'regional' },
  { domain: 'france24.com', sourceId: null, name: 'France 24', group: 'regional' },
  { domain: 'dw.com', sourceId: null, name: 'Deutsche Welle', group: 'regional' },
  { domain: 'scmp.com', sourceId: null, name: 'South China Morning Post', group: 'regional' },
  { domain: 'timesofindia.indiatimes.com', sourceId: 'the-times-of-india', name: 'Times of India', group: 'regional' },
  { domain: 'thehindu.com', sourceId: 'the-hindu', name: 'The Hindu', group: 'regional' },
  { domain: 'japantimes.co.jp', sourceId: null, name: 'Japan Times', group: 'regional' },
  { domain: 'straitstimes.com', sourceId: null, name: 'Straits Times', group: 'regional' },
  { domain: 'caixinglobal.com', sourceId: null, name: 'Caixin Global', group: 'regional' },
  { domain: 'asia.nikkei.com', sourceId: null, name: 'Nikkei Asia', group: 'regional' },
  // â”€â”€ Regional (supplemental â€” underserved countries) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Canada (national outlets improve coverage when NewsAPI trusted-domains filter is active)
  { domain: 'cbc.ca', sourceId: null, name: 'CBC News', group: 'regional' },
  { domain: 'globeandmail.com', sourceId: null, name: 'The Globe and Mail', group: 'regional' },
  { domain: 'nationalpost.com', sourceId: null, name: 'National Post', group: 'regional' },
  { domain: 'thestar.com', sourceId: null, name: 'Toronto Star', group: 'regional' },
  // New Zealand
  { domain: 'rnz.co.nz', sourceId: null, name: 'Radio New Zealand', group: 'regional' },
  { domain: 'nzherald.co.nz', sourceId: null, name: 'NZ Herald', group: 'regional' },
  // Ireland
  { domain: 'irishtimes.com', sourceId: null, name: 'Irish Times', group: 'regional' },
  { domain: 'rte.ie', sourceId: null, name: 'RTÃ‰ News', group: 'regional' },
  // European English-language (supplements DW for non-English-dominant EU countries)
  { domain: 'thelocal.com', sourceId: null, name: 'The Local Europe', group: 'regional' },
  { domain: 'swissinfo.ch', sourceId: null, name: 'SWI swissinfo.ch', group: 'regional' },
  { domain: 'dutchnews.nl', sourceId: null, name: 'DutchNews.nl', group: 'regional' },
  { domain: 'polandin.com', sourceId: null, name: 'Poland In', group: 'regional' },
  { domain: 'politico.eu', sourceId: null, name: 'Politico Europe', group: 'regional' },
  // Latin America
  { domain: 'brazilianreport.com', sourceId: null, name: 'The Brazilian Report', group: 'regional' },
  { domain: 'mercopress.com', sourceId: null, name: 'MercoPress', group: 'regional' },
  { domain: 'batimes.com.ar', sourceId: null, name: 'Buenos Aires Times', group: 'regional' },
  { domain: 'mexiconewsdaily.com', sourceId: null, name: 'Mexico News Daily', group: 'regional' },
  // Africa
  { domain: 'dailymaverick.co.za', sourceId: null, name: 'Daily Maverick', group: 'regional' },
  { domain: 'businessday.ng', sourceId: null, name: 'BusinessDay Nigeria', group: 'regional' },
  { domain: 'nation.africa', sourceId: null, name: 'Nation Africa', group: 'regional' },
  { domain: 'africanews.com', sourceId: null, name: 'Africanews', group: 'regional' },
  // Middle East (supplements Al Jazeera)
  { domain: 'arabnews.com', sourceId: null, name: 'Arab News', group: 'regional' },
  { domain: 'thenationalnews.com', sourceId: null, name: 'The National', group: 'regional' },
  { domain: 'timesofisrael.com', sourceId: null, name: 'Times of Israel', group: 'regional' },
  { domain: 'middleeasteye.net', sourceId: null, name: 'Middle East Eye', group: 'regional' },
  // Korea
  { domain: 'koreaherald.com', sourceId: null, name: 'Korea Herald', group: 'regional' },
  // Southeast Asia (supplements Straits Times)
  { domain: 'channelnewsasia.com', sourceId: null, name: 'Channel NewsAsia', group: 'regional' },
  { domain: 'bangkokpost.com', sourceId: null, name: 'Bangkok Post', group: 'regional' },
  { domain: 'jakartaglobe.id', sourceId: null, name: 'Jakarta Globe', group: 'regional' },
  { domain: 'inquirer.net', sourceId: null, name: 'Philippine Daily Inquirer', group: 'regional' },
  { domain: 'rappler.com', sourceId: null, name: 'Rappler', group: 'regional' },
  // Eastern Europe
  { domain: 'kyivindependent.com', sourceId: null, name: 'Kyiv Independent', group: 'regional' },
  { domain: 'notesfrompoland.com', sourceId: null, name: 'Notes from Poland', group: 'regional' },
  { domain: 'meduza.io', sourceId: null, name: 'Meduza', group: 'regional' },
  { domain: 'independent.co.uk', sourceId: 'the-independent', name: 'The Independent', group: 'regional' },
  // â”€â”€ Business & Finance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'politico.com', sourceId: 'politico', name: 'Politico', group: 'business' },
  { domain: 'economist.com', sourceId: null, name: 'The Economist', group: 'business' },
  { domain: 'ft.com', sourceId: null, name: 'Financial Times', group: 'business' },
  { domain: 'bloomberg.com', sourceId: 'bloomberg', name: 'Bloomberg', group: 'business' },
  { domain: 'wsj.com', sourceId: 'the-wall-street-journal', name: 'Wall Street Journal', group: 'business' },
  { domain: 'cnbc.com', sourceId: 'cnbc', name: 'CNBC', group: 'business' },
  { domain: 'forbes.com', sourceId: 'forbes', name: 'Forbes', group: 'business' },
  { domain: 'fortune.com', sourceId: null, name: 'Fortune', group: 'business' },
  // â”€â”€ Technology â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'arstechnica.com', sourceId: 'ars-technica', name: 'Ars Technica', group: 'technology' },
  { domain: 'wired.com', sourceId: 'wired', name: 'Wired', group: 'technology' },
  { domain: 'techcrunch.com', sourceId: 'techcrunch', name: 'TechCrunch', group: 'technology' },
  { domain: 'theverge.com', sourceId: 'the-verge', name: 'The Verge', group: 'technology' },
  { domain: 'engadget.com', sourceId: 'engadget', name: 'Engadget', group: 'technology' },
  { domain: 'thenextweb.com', sourceId: 'the-next-web', name: 'The Next Web', group: 'technology' },
  { domain: 'technologyreview.com', sourceId: null, name: 'MIT Technology Review', group: 'technology' },
  { domain: 'venturebeat.com', sourceId: 'venture-beat', name: 'VentureBeat', group: 'technology' },
  { domain: 'zdnet.com', sourceId: 'zdnet', name: 'ZDNet', group: 'technology' },
  // â”€â”€ Science â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'nationalgeographic.com', sourceId: 'national-geographic', name: 'National Geographic', group: 'science' },
  { domain: 'newscientist.com', sourceId: 'new-scientist', name: 'New Scientist', group: 'science' },
  { domain: 'scientificamerican.com', sourceId: null, name: 'Scientific American', group: 'science' },
  { domain: 'nature.com', sourceId: null, name: 'Nature', group: 'science' },
  { domain: 'statnews.com', sourceId: null, name: 'STAT News', group: 'science' },
  // â”€â”€ Sports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'espn.com', sourceId: 'espn', name: 'ESPN', group: 'sports' },
  { domain: 'theathletic.com', sourceId: null, name: 'The Athletic', group: 'sports' },
  { domain: 'si.com', sourceId: null, name: 'Sports Illustrated', group: 'sports' },
  { domain: 'skysports.com', sourceId: null, name: 'Sky Sports', group: 'sports' },
  { domain: 'bleacherreport.com', sourceId: 'bleacher-report', name: 'Bleacher Report', group: 'sports' },
  // â”€â”€ Gaming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'ign.com', sourceId: 'ign', name: 'IGN', group: 'gaming' },
  { domain: 'polygon.com', sourceId: 'polygon', name: 'Polygon', group: 'gaming' },
  { domain: 'eurogamer.net', sourceId: null, name: 'Eurogamer', group: 'gaming' },
  { domain: 'pcgamer.com', sourceId: null, name: 'PC Gamer', group: 'gaming' },
  { domain: 'kotaku.com', sourceId: null, name: 'Kotaku', group: 'gaming' },
  { domain: 'gamespot.com', sourceId: null, name: 'GameSpot', group: 'gaming' },
  { domain: 'rockpapershotgun.com', sourceId: null, name: 'Rock Paper Shotgun', group: 'gaming' },
  { domain: 'gamesradar.com', sourceId: null, name: 'GamesRadar', group: 'gaming' },
  { domain: 'vg247.com', sourceId: null, name: 'VG247', group: 'gaming' },
  { domain: 'dualshockers.com', sourceId: null, name: 'DualShockers', group: 'gaming' },
  // â”€â”€ Film & TV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'variety.com', sourceId: null, name: 'Variety', group: 'film' },
  { domain: 'hollywoodreporter.com', sourceId: null, name: 'Hollywood Reporter', group: 'film' },
  { domain: 'deadline.com', sourceId: null, name: 'Deadline', group: 'film' },
  { domain: 'ew.com', sourceId: 'entertainment-weekly', name: 'Entertainment Weekly', group: 'film' },
  { domain: 'indiewire.com', sourceId: null, name: 'IndieWire', group: 'film' },
  { domain: 'vulture.com', sourceId: null, name: 'Vulture', group: 'tv' },
  { domain: 'tvline.com', sourceId: null, name: 'TVLine', group: 'tv' },
  { domain: 'collider.com', sourceId: null, name: 'Collider', group: 'tv' },
  { domain: 'buzzfeed.com', sourceId: 'buzzfeed', name: 'BuzzFeed', group: 'tv' },
  // â”€â”€ Music â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'rollingstone.com', sourceId: null, name: 'Rolling Stone', group: 'music' },
  { domain: 'billboard.com', sourceId: null, name: 'Billboard', group: 'music' },
  { domain: 'pitchfork.com', sourceId: null, name: 'Pitchfork', group: 'music' },
  { domain: 'nme.com', sourceId: null, name: 'NME', group: 'music' },
  { domain: 'consequence.net', sourceId: null, name: 'Consequence of Sound', group: 'music' },
  // â”€â”€ Middle East (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'dailysabah.com', sourceId: null, name: 'Daily Sabah', group: 'regional' },
  // â”€â”€ Asia (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'nhk.or.jp', sourceId: null, name: 'NHK World', group: 'regional' },
  { domain: 'dawn.com', sourceId: null, name: 'Dawn (Pakistan)', group: 'regional' },
  { domain: 'thedailystar.net', sourceId: null, name: 'The Daily Star (BD)', group: 'regional' },
  { domain: 'vietnamnews.vn', sourceId: null, name: 'Vietnam News', group: 'regional' },
  // â”€â”€ Africa (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'theeastafrican.co.ke', sourceId: null, name: 'The East African', group: 'regional' },
  // â”€â”€ Europe (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'thelocal.de', sourceId: null, name: 'The Local (Germany)', group: 'regional' },
  { domain: 'thelocal.fr', sourceId: null, name: 'The Local (France)', group: 'regional' },
  { domain: 'thelocal.es', sourceId: null, name: 'The Local (Spain)', group: 'regional' },
  { domain: 'thelocal.se', sourceId: null, name: 'The Local (Sweden)', group: 'regional' },
  { domain: 'thelocal.it', sourceId: null, name: 'The Local (Italy)', group: 'regional' },
  { domain: 'thelocal.no', sourceId: null, name: 'The Local (Norway)', group: 'regional' },
  { domain: 'euractiv.com', sourceId: null, name: 'Euractiv', group: 'regional' },
  // â”€â”€ Americas (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { domain: 'ticotimes.net', sourceId: null, name: 'Tico Times', group: 'regional' },
  { domain: 'colombiareports.com', sourceId: null, name: 'Colombia Reports', group: 'regional' },
];

// Build domain and source-ID strings, optionally filtered by a user-supplied domain list
function buildTrustedDomains(userDomains) {
  const sources = userDomains && userDomains.length > 0
    ? ALL_TRUSTED_SOURCES.filter(s => userDomains.includes(s.domain))
    : ALL_TRUSTED_SOURCES;
  return sources.map(s => s.domain).join(',');
}

function buildTrustedSourceIds(userDomains) {
  const sources = userDomains && userDomains.length > 0
    ? ALL_TRUSTED_SOURCES.filter(s => userDomains.includes(s.domain))
    : ALL_TRUSTED_SOURCES;
  return sources.filter(s => s.sourceId).map(s => s.sourceId).join(',');
}

// Default (all sources) â€” used when no user selection is provided
const TRUSTED_DOMAINS = buildTrustedDomains(null);
const TRUSTED_SOURCE_IDS = buildTrustedSourceIds(null);

// Keywords/demonyms for relevance filtering â€” articles must mention at least one term.
// Includes country name, demonyms, abbreviations, capital cities, and major cities.
// City names are strong relevance signals (e.g. "Tokyo" â†’ Japan, "Berlin" â†’ Germany).
const COUNTRY_RELEVANCE_KEYWORDS = {
  // â”€â”€ North America â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  us: ['united states', 'america', 'american', 'u.s.', ' us ', 'washington d.c.', 'new york', 'los angeles', 'chicago', 'houston', 'san francisco', 'silicon valley', 'trump', 'donald trump', 'biden', 'joe biden', 'harris', 'kamala harris', 'senate', 'house of representatives', 'supreme court', 'white house', 'capitol', 'pentagon', 'federal reserve', 'republican', 'democrat', 'gop', 'atlanta', 'miami', 'seattle', 'dallas', 'phoenix', 'boston', 'denver', 'minneapolis', 'rubio', 'marco rubio', 'musk', 'elon musk'],
  ca: ['canada', 'canadian', 'ottawa', 'toronto', 'vancouver', 'montreal', 'calgary', 'trudeau', 'justin trudeau', 'poilievre', 'pierre poilievre', 'jagmeet singh', 'mark carney', 'parliament hill', 'house of commons', 'edmonton', 'winnipeg', 'hamilton', 'ontario', 'quebec', 'alberta', 'british columbia', 'nova scotia', 'liberal party of canada', 'ndp', 'rcmp', 'bank of canada'],
  mx: ['mexico', 'mexican', 'mexico city', 'guadalajara', 'monterrey', 'sheinbaum', 'claudia sheinbaum', 'amlo', 'obrador', 'morena', 'tijuana', 'cancun', 'puebla', 'oaxaca', 'juarez', 'merida', 'narco', 'cartel'],
  cu: ['cuba', 'cuban', 'havana', 'dÃ­az-canel', 'diaz-canel', 'communist party of cuba'],
  jm: ['jamaica', 'jamaican', 'kingston', 'holness', 'andrew holness'],
  cr: ['costa rica', 'costa rican', 'san jose', 'chaves', 'rodrigo chaves'],
  pa: ['panama', 'panamanian', 'panama city', 'mulino', 'josÃ© raÃºl mulino', 'panama canal'],
  do: ['dominican republic', 'dominican', 'santo domingo', 'abinader', 'luis abinader'],
  gt: ['guatemala', 'guatemalan', 'guatemala city', 'arÃ©valo', 'bernardo arÃ©valo'],
  hn: ['honduras', 'honduran', 'tegucigalpa', 'castro', 'xiomara castro'],
  // â”€â”€ South America â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  br: ['brazil', 'brazilian', 'brasilia', 'sÃ£o paulo', 'sao paulo', 'rio de janeiro', 'lula', 'lula da silva', 'planalto', 'bolsonaro', 'belo horizonte', 'fortaleza', 'manaus', 'curitiba', 'porto alegre', 'amazon', 'pt party', 'stf'],
  ar: ['argentina', 'argentinian', 'argentine', 'buenos aires', 'milei', 'javier milei', 'kirchner', 'casa rosada', 'peronist', 'cordoba', 'rosario', 'mendoza', 'libertad avanza', 'peso crisis'],
  cl: ['chile', 'chilean', 'santiago', 'boric', 'gabriel boric', 'valparaiso', 'concepcion', 'antofagasta'],
  co: ['colombia', 'colombian', 'bogota', 'bogotÃ¡', 'medellin', 'medellÃ­n', 'petro', 'gustavo petro', 'cartagena', 'cali', 'barranquilla', 'farc', 'coca'],
  pe: ['peru', 'peruvian', 'lima', 'boluarte', 'dina boluarte', 'castillo', 'arequipa', 'trujillo'],
  ve: ['venezuela', 'venezuelan', 'caracas', 'maduro', 'nicolas maduro', 'chavismo', 'miraflores', 'edmundo gonzalez', 'marÃ­a corina machado'],
  ec: ['ecuador', 'ecuadorian', 'quito', 'guayaquil', 'noboa', 'daniel noboa', 'galapagos'],
  uy: ['uruguay', 'uruguayan', 'montevideo', 'orsi', 'yamandÃº orsi', 'frente amplio'],
  py: ['paraguay', 'paraguayan', 'asuncion', 'asunciÃ³n', 'peÃ±a', 'santiago peÃ±a', 'colorado party'],
  bo: ['bolivia', 'bolivian', 'la paz', 'sucre', 'arce', 'luis arce', 'morales', 'evo morales', 'cochabamba'],
  // â”€â”€ Europe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  gb: ['united kingdom', 'britain', 'british', ' uk ', 'england', 'scotland', 'wales', 'london', 'manchester', 'birmingham', 'edinburgh', 'westminster', 'downing street', 'starmer', 'keir starmer', 'labour', 'tory', 'tories', 'conservative', 'sunak', 'rishi sunak', 'badenoch', 'kemi badenoch', 'reeves', 'rachel reeves', 'farage', 'nigel farage', 'reform uk', 'liverpool', 'leeds', 'sheffield', 'parliament', 'chancellor of the exchequer', 'bank of england', 'nhs', 'brexit', 'northern ireland'],
  de: ['germany', 'german', 'berlin', 'munich', 'frankfurt', 'hamburg', 'bundestag', 'scholz', 'olaf scholz', 'merz', 'friedrich merz', 'spd', 'cdu', 'habeck', 'robert habeck', 'baerbock', 'annalena baerbock', 'bundesrat', 'afd', 'fdp', 'csu', 'greens', 'cologne', 'kÃ¶ln', 'dÃ¼sseldorf', 'dusseldorf', 'stuttgart', 'chancellery', 'chancellorship', 'weidel', 'alice weidel'],
  fr: ['france', 'french', 'paris', 'marseille', 'lyon', 'Ã©lysÃ©e', 'elysee', 'macron', 'emmanuel macron', 'le pen', 'marine le pen', 'bayrou', 'toulouse', 'nice', 'bordeaux', 'national assembly', 'rassemblement national', 'renaissance party', 'nantes', 'strasbourg', 'lille', 'rennes', 'french senate', 'matignon'],
  it: ['italy', 'italian', 'rome', 'milan', 'naples', 'turin', 'meloni', 'giorgia meloni', 'quirinale', 'genoa', 'bologna', 'palazzo chigi', 'fratelli', 'lega', 'five star', 'democratic party', 'venice', 'florence', 'palermo'],
  es: ['spain', 'spanish', 'madrid', 'barcelona', 'seville', 'sanchez', 'pedro sanchez', 'catalan', 'catalonia', 'valencia', 'bilbao', 'moncloa', 'psoe', 'pp party', 'vox', 'podemos', 'zaragoza', 'malaga', 'cortes', 'rajoy'],
  nl: ['netherlands', 'dutch', 'amsterdam', 'rotterdam', 'the hague', 'den haag', 'wilders', 'geert wilders', 'utrecht', 'pvv', 'eindhoven', 'schiphol', 'second chamber', 'tweede kamer'],
  se: ['sweden', 'swedish', 'stockholm', 'gothenburg', 'kristersson', 'ulf kristersson', 'malmo', 'riksdag', 'sweden democrats', 'moderate party', 'goteborg'],
  no: ['norway', 'norwegian', 'oslo', 'bergen', 'storting', 'stÃ¸re', 'jonas gahr stÃ¸re', 'trondheim', 'stavanger', 'equinor', 'norwegian'],
  pl: ['poland', 'polish', 'warsaw', 'krakow', 'krakÃ³w', 'gdansk', 'tusk', 'donald tusk', 'duda', 'andrzej duda', 'pis', 'sejm', 'wroclaw', 'wrocÅ‚aw', 'poznan', 'lodz', 'Å‚Ã³dÅº', 'senate poland', 'platforma'],
  ch: ['switzerland', 'swiss', 'bern', 'zurich', 'zÃ¼rich', 'geneva', 'davos', 'federal council', 'lausanne', 'basel', 'lugano', 'swissinfo', 'world economic forum', 'wef'],
  be: ['belgium', 'belgian', 'brussels', 'antwerp', 'ghent', 'de wever', 'bart de wever', 'vlaams belang', 'mr party', 'liege', 'bruges', 'louvain'],
  at: ['austria', 'austrian', 'vienna', 'salzburg', 'kickl', 'herbert kickl', 'fpÃ¶', 'graz', 'linz', 'innsbruck', 'Ã¶st', 'nationalrat', 'austrian freedom party'],
  ie: ['ireland', 'irish', 'dublin', 'cork', 'martin', 'micheÃ¡l martin', 'galway', 'taoiseach', 'tÃ¡naiste', 'tanaiste', 'fine gael', 'fianna fail', 'sinn fÃ©in', 'sinn fein', 'harris', 'simon harris', 'limerick', 'waterford', 'dÃ¡il', 'seanad', 'oireachtas'],
  pt: ['portugal', 'portuguese', 'lisbon', 'porto', 'montenegro', 'luÃ­s montenegro', 'ps party', 'psd', 'chega', 'coimbra', 'braga', 'assembleia da repÃºblica'],
  dk: ['denmark', 'danish', 'copenhagen', 'frederiksen', 'mette frederiksen', 'folketing', 'aarhus', 'odense', 'aalborg', 'danish people'],
  fi: ['finland', 'finnish', 'helsinki', 'orpo', 'petteri orpo', 'eduskunta', 'tampere', 'turku', 'national coalition', 'ps party', 'true finns'],
  gr: ['greece', 'greek', 'athens', 'thessaloniki', 'mitsotakis', 'kyriakos mitsotakis', 'new democracy', 'syriza', 'piraeus', 'hellenic'],
  cz: ['czech republic', 'czech', 'czechia', 'prague', 'fiala', 'petr fiala', 'brno', 'ostrava', 'spolu', 'ano movement', 'babis', 'andrej babiÅ¡'],
  ro: ['romania', 'romanian', 'bucharest', 'iohannis', 'ciuca', 'cluj', 'timisoara', 'iasi', 'george simion', 'aur party'],
  hu: ['hungary', 'hungarian', 'budapest', 'orban', 'viktor orban', 'fidesz', 'debrecen', 'pÃ©cs', 'orbÃ¡n'],
  ua: ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'odesa', 'odessa', 'kharkiv', 'lviv', 'zelenskyy', 'zelensky', 'kherson', 'zaporizhzhia', 'donetsk', 'mariupol', 'zaluzhny', 'verkhovna rada', 'dnipro'],
  rs: ['serbia', 'serbian', 'belgrade', 'vucic', 'aleksandar vucic', 'novi sad', 'sns party', 'nis'],
  hr: ['croatia', 'croatian', 'zagreb', 'plenkoviÄ‡', 'andrej plenkovic', 'split', 'rijeka', 'dubrovnik', 'hdz'],
  bg: ['bulgaria', 'bulgarian', 'sofia', 'borissov', 'denkov', 'plovdiv', 'varna', 'gerb party'],
  sk: ['slovakia', 'slovak', 'bratislava', 'fico', 'robert fico', 'pellegrini', 'kosice', 'smer party'],
  lt: ['lithuania', 'lithuanian', 'vilnius', 'nauseda', 'gitanas nauseda', 'kaunas', 'seimas', 'klaipeda'],
  lv: ['latvia', 'latvian', 'riga', 'silina', 'evika silina', 'saeima', 'daugavpils'],
  ee: ['estonia', 'estonian', 'tallinn', 'kallas', 'kaja kallas', 'riigikogu', 'tartu', 'narva'],
  is: ['iceland', 'icelandic', 'reykjavik', 'reykjavÃ­k', 'jakobsdottir', 'althing', 'althingi'],
  lu: ['luxembourg', 'luxembourgish', 'frieden', 'luc frieden', 'luxembourg city', 'csv party'],
  si: ['slovenia', 'slovenian', 'ljubljana', 'golob', 'robert golob', 'maribor', 'state assembly'],
  // â”€â”€ Asia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  cn: ['china', 'chinese', 'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hong kong', 'xi jinping', 'ccp', 'politburo', 'npc', 'li qiang', 'chengdu', 'wuhan', 'tianjin', 'hangzhou', 'people\'s liberation army', 'pla', 'taiwan strait', 'south china sea', 'brics', 'belt and road'],
  jp: ['japan', 'japanese', 'tokyo', 'osaka', 'kyoto', 'yokohama', 'ishiba', 'shigeru ishiba', 'ldp', 'diet', 'abe', 'kishida', 'nagoya', 'sapporo', 'fukuoka', 'bank of japan', 'self-defense force', 'komeito'],
  in: ['india', 'indian', 'new delhi', 'mumbai', 'bangalore', 'bengaluru', 'chennai', 'kolkata', 'hyderabad', 'modi', 'narendra modi', 'bjp', 'gandhi', 'rahul gandhi', 'lok sabha', 'rajya sabha', 'ahmedabad', 'pune', 'congress party', 'rss', 'supreme court of india', 'jaipur', 'lucknow', 'surat', 'patna'],
  kr: ['south korea', 'korean', 'korea', 'seoul', 'busan', 'yoon', 'yoon suk-yeol', 'lee jae-myung', 'han duck-soo', 'national assembly', 'incheon', 'gwangju', 'daegu', 'daejeon', 'martial law', 'democratic party of korea', 'people power party'],
  sg: ['singapore', 'singaporean', 'lawrence wong', 'lee hsien loong', 'pap', "people's action party", 'mas', 'temasek', 'gic'],
  hk: ['hong kong', 'john lee', 'legco', 'carrie lam', 'basic law', 'national security law', 'kowloon', 'new territories'],
  tw: ['taiwan', 'taiwanese', 'taipei', 'lai ching-te', 'william lai', 'tsai', 'tsai ing-wen', 'kuomintang', 'kmt', 'legislative yuan', 'dpp', 'strait'],
  id: ['indonesia', 'indonesian', 'jakarta', 'bali', 'prabowo', 'prabowo subianto', 'jokowi', 'widodo', 'surabaya', 'bandung', 'medan', 'pdip', 'gerindra', 'nusantara capital'],
  th: ['thailand', 'thai', 'bangkok', 'paetongtarn', 'thaksin', 'shinawatra', 'chiang mai', 'pattaya', 'phuket', 'pheu thai', 'move forward', 'constitutional court'],
  my: ['malaysia', 'malaysian', 'kuala lumpur', 'anwar', 'anwar ibrahim', 'putrajaya', 'penang', 'johor', 'najib', 'sabah', 'sarawak', 'pkr', 'umno'],
  ph: ['philippines', 'philippine', 'filipino', 'manila', 'duterte', 'marcos', 'ferdinand marcos', 'bongbong', 'quezon city', 'davao', 'cebu', 'sara duterte', 'bangsamoro'],
  vn: ['vietnam', 'vietnamese', 'hanoi', 'ho chi minh', 'to lam', 'communist party of vietnam', 'haiphong', 'da nang', 'politburo vietnam'],
  pk: ['pakistan', 'pakistani', 'islamabad', 'karachi', 'lahore', 'imran khan', 'sharif', 'shehbaz sharif', 'nawaz', 'pti', 'pmln', 'rawalpindi', 'peshawar', 'army chief', 'isi', 'supreme court pakistan'],
  bd: ['bangladesh', 'bangladeshi', 'dhaka', 'yunus', 'muhammad yunus', 'hasina', 'chittagong', 'sylhet', 'awami league', 'student revolution'],
  lk: ['sri lanka', 'sri lankan', 'colombo', 'dissanayake', 'anura kumara', 'rajapaksa', 'kandy', 'jvp', 'npp coalition'],
  mm: ['myanmar', 'burmese', 'burma', 'yangon', 'naypyidaw', 'suu kyi', 'aung san suu kyi', 'tatmadaw', 'min aung hlaing', 'nld', 'junta', 'resistance'],
  kh: ['cambodia', 'cambodian', 'phnom penh', 'hun manet', 'hun sen', 'siem reap', 'cpp party'],
  np: ['nepal', 'nepalese', 'nepali', 'kathmandu', 'oli', 'kp sharma oli', 'pokhara', 'prachanda', 'puspa kamal dahal'],
  nz: ['new zealand', 'auckland', 'wellington', 'luxon', 'christopher luxon', 'hipkins', 'chris hipkins', 'kiwi', 'maori', 'christchurch', 'hamilton', 'tauranga', 'dunedin', 'national party nz', 'labour nz', 'act party', 'rnz'],
  au: ['australia', 'australian', 'sydney', 'melbourne', 'canberra', 'brisbane', 'perth', 'albanese', 'anthony albanese', 'dutton', 'peter dutton', 'labor', 'liberal party', 'national party', 'greens', 'parliament house', 'asx', 'gold coast', 'adelaide', 'darwin', 'hobart', 'nsw', 'queensland', 'reserve bank of australia'],
  fj: ['fiji', 'fijian', 'suva', 'rabuka', 'sitiveni rabuka'],
  pg: ['papua new guinea', 'port moresby', 'marape', 'james marape'],
  // â”€â”€ Middle East â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  il: ['israel', 'israeli', 'jerusalem', 'tel aviv', 'netanyahu', 'knesset', 'idf', 'ben-gvir', 'gallant', 'likud', 'gantz', 'haifa', 'herzog', 'smotrich', 'yoav gallant', 'iron dome'],
  ps: ['palestine', 'palestinian', 'gaza', 'west bank', 'ramallah', 'hamas', 'fatah', 'rafah', 'sinwar', 'haniyeh', 'un rwa', 'unrwa', 'occupied', 'two-state', 'abbas', 'mahmoud abbas'],
  ae: ['uae', 'emirates', 'emirati', 'dubai', 'abu dhabi', 'mbz', 'mohammed bin zayed', 'adnoc', 'sheikh', 'sharjah', 'expo', 'expo 2020'],
  sa: ['saudi', 'saudi arabia', 'riyadh', 'jeddah', 'mecca', 'mbs', 'mohammed bin salman', 'bin salman', 'aramco', 'neom', 'vision 2030', 'medina', 'opec'],
  tr: ['turkey', 'turkish', 'tÃ¼rkiye', 'ankara', 'istanbul', 'erdogan', 'erdoÄŸan', 'akp', 'chp', 'izmir', 'antalya', 'kurds', 'pkk', 'lira', 'bosphorus', 'weidel', 'imamoglu', 'ekrem imamoÄŸlu'],
  qa: ['qatar', 'qatari', 'doha', 'al thani', 'tamim', 'qna', 'al jazeera'],
  kw: ['kuwait', 'kuwaiti', 'kuwait city', 'national assembly', 'emir'],
  bh: ['bahrain', 'bahraini', 'manama', 'hamad', 'king hamad'],
  om: ['oman', 'omani', 'muscat', 'sultan haitham', 'pdv', 'oman oil'],
  jo: ['jordan', 'jordanian', 'amman', 'king abdullah', 'hashemite', 'queen rania'],
  lb: ['lebanon', 'lebanese', 'beirut', 'hezbollah', 'nasrallah', 'aoun', 'salam', 'nawaf salam', 'joseph aoun'],
  iq: ['iraq', 'iraqi', 'baghdad', 'basra', 'mosul', 'erbil', 'kurdistan', 'al-sudani', 'pmu', 'shia'],
  ir: ['iran', 'iranian', 'tehran', 'khamenei', 'supreme leader', 'irgc', 'pezeshkian', 'nuclear deal', 'isfahan', 'mashhad', 'sanctions iran', 'revolutionary guard'],
  // â”€â”€ Africa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  za: ['south africa', 'south african', 'johannesburg', 'cape town', 'pretoria', 'durban', 'ramaphosa', 'cyril ramaphosa', 'anc', 'da', 'eff', 'zuma', 'port elizabeth', 'mk party', 'julius malema', 'government of national unity'],
  ng: ['nigeria', 'nigerian', 'lagos', 'abuja', 'tinubu', 'bola tinubu', 'buhari', 'kano', 'ibadan', 'national assembly nigeria', 'kaduna', 'port harcourt', 'naira', 'apc party', 'pdp party'],
  eg: ['egypt', 'egyptian', 'cairo', 'alexandria', 'sisi', 'el-sisi', 'abdel fattah', 'suez canal', 'suez', 'giza', 'nile dam', 'egyptian pound'],
  ke: ['kenya', 'kenyan', 'nairobi', 'mombasa', 'ruto', 'william ruto', 'kenyatta', 'odinga', 'kisumu', 'national assembly kenya', 'shilling'],
  ma: ['morocco', 'moroccan', 'rabat', 'casablanca', 'marrakech', 'mohammed vi', 'tangier', 'fez', 'sahara', 'rif'],
  gh: ['ghana', 'ghanaian', 'accra', 'mahama', 'john mahama', 'akufo-addo', 'kumasi', 'parliament ghana', 'ndc', 'npp'],
  et: ['ethiopia', 'ethiopian', 'addis ababa', 'abiy', 'abiy ahmed', 'tigray', 'oromo', 'dire dawa', 'amhara', 'tplf'],
  tz: ['tanzania', 'tanzanian', 'dar es salaam', 'dodoma', 'hassan', 'samia hassan', 'zanzibar', 'chama cha mapinduzi', 'ccm'],
  ug: ['uganda', 'ugandan', 'kampala', 'museveni', 'yoweri museveni', 'entebbe', 'nrm party'],
  sn: ['senegal', 'senegalese', 'dakar', 'faye', 'bassirou diomaye faye', 'sonko', 'thiÃ¨s', 'pastef'],
  ci: ['ivory coast', "cote d'ivoire", 'ivorian', 'abidjan', 'ouattara', 'alassane ouattara', 'yamoussoukro', 'san-pÃ©dro'],
  cm: ['cameroon', 'cameroonian', 'yaoundÃ©', 'yaounde', 'douala', 'biya', 'paul biya', 'anglophone crisis'],
  dz: ['algeria', 'algerian', 'algiers', 'tebboune', 'abdelmadjid tebboune', 'oran', 'sonatrach'],
  tn: ['tunisia', 'tunisian', 'tunis', 'saied', 'kais saied', 'sfax', 'ennahda'],
  rw: ['rwanda', 'rwandan', 'kigali', 'kagame', 'paul kagame', 'rpf', 'eastern drc'],
  ru: ['russia', 'russian', 'moscow', 'kremlin', 'putin', 'st. petersburg', 'saint petersburg', 'lavrov', 'medvedev', 'duma', 'navalny', 'novosibirsk', 'siluanov', 'rosneft', 'gazprom', 'wagner', 'prigozhin', 'belousov'],
};

// Demonyms used to build tighter search queries that pair the adjective with category terms.
// E.g. "Australian politics" instead of "Australia" AND "politics".
// Countries without a demonym here fall back to bare country name in loose queries â€”
// adding an entry here improves query precision for that country.
const COUNTRY_DEMONYMS = {
  // â”€â”€ North America â”€â”€
  us: 'American', ca: 'Canadian', mx: 'Mexican', cu: 'Cuban',
  jm: 'Jamaican', cr: 'Costa Rican', pa: 'Panamanian', do: 'Dominican',
  gt: 'Guatemalan', hn: 'Honduran',
  // â”€â”€ South America â”€â”€
  br: 'Brazilian', ar: 'Argentine', cl: 'Chilean', co: 'Colombian',
  pe: 'Peruvian', ve: 'Venezuelan', ec: 'Ecuadorian', uy: 'Uruguayan',
  py: 'Paraguayan', bo: 'Bolivian',
  // â”€â”€ Europe â”€â”€
  gb: 'British', de: 'German', fr: 'French', it: 'Italian',
  es: 'Spanish', nl: 'Dutch', se: 'Swedish', no: 'Norwegian',
  pl: 'Polish', ch: 'Swiss', be: 'Belgian', at: 'Austrian',
  ie: 'Irish', pt: 'Portuguese', dk: 'Danish', fi: 'Finnish',
  gr: 'Greek', cz: 'Czech', ro: 'Romanian', hu: 'Hungarian',
  ua: 'Ukrainian', rs: 'Serbian', hr: 'Croatian', bg: 'Bulgarian',
  sk: 'Slovak', lt: 'Lithuanian', lv: 'Latvian', ee: 'Estonian',
  is: 'Icelandic', lu: 'Luxembourgish', si: 'Slovenian', ru: 'Russian',
  // â”€â”€ Asia â”€â”€
  cn: 'Chinese', jp: 'Japanese', in: 'Indian', kr: 'South Korean',
  sg: 'Singaporean', hk: 'Hong Kong', tw: 'Taiwanese', id: 'Indonesian',
  th: 'Thai', my: 'Malaysian', ph: 'Philippine', vn: 'Vietnamese',
  pk: 'Pakistani', bd: 'Bangladeshi', lk: 'Sri Lankan', mm: 'Myanmar',
  kh: 'Cambodian', np: 'Nepalese',
  // â”€â”€ Oceania â”€â”€
  au: 'Australian', nz: 'New Zealand', fj: 'Fijian', pg: 'Papua New Guinean',
  // â”€â”€ Middle East â”€â”€
  il: 'Israeli', ps: 'Palestinian', ae: 'Emirati', sa: 'Saudi',
  tr: 'Turkish', qa: 'Qatari', kw: 'Kuwaiti', bh: 'Bahraini',
  om: 'Omani', jo: 'Jordanian', lb: 'Lebanese', iq: 'Iraqi',
  ir: 'Iranian',
  // â”€â”€ Africa â”€â”€
  za: 'South African', ng: 'Nigerian', eg: 'Egyptian', ke: 'Kenyan',
  ma: 'Moroccan', gh: 'Ghanaian', et: 'Ethiopian', tz: 'Tanzanian',
  ug: 'Ugandan', sn: 'Senegalese', ci: 'Ivorian', cm: 'Cameroonian',
  dz: 'Algerian', tn: 'Tunisian', rw: 'Rwandan',
};

// Short category noun phrases used to build national-relevance queries.
// Each entry produces queries like "Australian economy" or "Indian election".
// These are paired with country demonyms, so keep them as common nouns/phrases.
const CATEGORY_QUERY_NOUNS = {
  politics: ['politics', 'election', 'parliament', 'prime minister', 'legislation', 'government', 'chancellor'],
  world: ['foreign policy', 'diplomacy', 'trade deal', 'international relations', 'summit'],
  business: ['economy', 'market', 'industry', 'trade', 'central bank', 'stocks', 'finance'],
  technology: ['tech', 'startup', 'innovation', 'digital', 'AI', 'software', 'cybersecurity'],
  science: ['research', 'science', 'discovery', 'climate', 'space', 'laboratory', 'environment'],
  health: ['health', 'hospital', 'healthcare', 'medical', 'disease', 'public health'],
  sports: ['sport', 'team', 'league', 'championship', 'football', 'cricket', 'athlete'],
  gaming: ['gaming', 'video game', 'esports', 'game industry', 'game developer', 'game release', 'mobile game'],
  film: ['film', 'movie', 'cinema', 'box office', 'film industry'],
  tv: ['television', 'TV', 'streaming', 'TV series', 'broadcast'],
  music: ['music', 'album', 'music festival', 'artist', 'chart', 'song', 'concert'],
};

// Category relevance keywords â€” used in post-fetch filtering to verify articles
// actually match the requested topic.
//
// Two tiers per category:
//   strong: Domain-specific terms that almost certainly indicate this category.
//           A single strong match is enough to confirm relevance.
//   weak:   Terms that appear in this category but also in others.
//           Require 2+ weak matches (or 1 weak + title presence) to confirm.
//
// NOTE: Prefix stems (e.g. 'politi') intentionally match 'political', 'politician',
// 'politics' etc. Terms that previously caused false positives across categories
// (e.g. 'game' in sports matching gaming, 'app' in tech matching 'apple/appeal')
// have been replaced with more specific alternatives.
const CATEGORY_RELEVANCE_KEYWORDS = {
  politics: {
    strong: [
      'politi', 'parliament', 'legislat', 'senator', 'congress',
      'ballot', 'referendum', 'bipartisan', 'geopoliti', 'impeach',
      'inaugurat', 'gubernator', 'governorship', 'caucus', 'filibuster',
      'executive order', 'head of state', 'prime minister', 'veto',
      // International political titles
      'chancellor', 'foreign minister', 'secretary of state', 'attorney general',
      'speaker of the house', 'opposition leader', 'party leader',
      // Electoral processes
      'by-election', 'snap election', 'no-confidence', 'head of government',
    ],
    weak: [
      'government', 'elect', 'minister', 'president', 'vote', 'voter',
      'opposition', 'coalition', 'democrat', 'republican',
      'labor party', 'cabinet', 'constitutional', 'sanction', 'diplomatic',
      'nato', 'tariff', 'populis', 'authoritar', 'regime', 'judiciary',
      'governance', 'sovereignty', 'junta', 'coup',
      // Parliamentary concepts
      'majority government', 'minority government', 'political party',
      'constituency', 'electorate',
    ],
  },
  world: {
    strong: [
      'diplomacy', 'diplomat', 'united nations', 'nato', 'treaty',
      'bilateral', 'multilateral', 'peacekeep', 'cease-fire', 'ceasefire',
      'annexation', 'territorial dispute', 'border dispute',
    ],
    weak: [
      'international', 'foreign', 'global', 'summit', 'sanction',
      'geopoliti', 'embassy', 'refugee', 'humanitarian', 'conflict',
      'alliance', 'sovereignty', 'occupation', 'migration', 'diaspora',
      'trade deal', 'foreign aid', 'foreign policy',
    ],
  },
  business: {
    strong: [
      'econom', 'stock market', 'financ', 'gdp', 'inflation', 'interest rate',
      'merger', 'acquisition', 'ipo', 'earnings', 'dividend', 'bankruptcy',
      'recession', 'wall street', 'dow jones', 'nasdaq', 's&p 500',
      'supply chain', 'quarterly', 'fiscal', 'monetary',
    ],
    weak: [
      'business', 'market', 'stock', 'bank', 'invest', 'profit', 'revenue',
      'startup', 'ceo', 'industry', 'commodit', 'oil price', 'crypto',
      'bitcoin', 'retail', 'consumer', 'workforce', 'export', 'import',
      'shareholder', 'valuation', 'hedge fund', 'venture capital',
      'central bank', 'trade',
    ],
  },
  technology: {
    strong: [
      'artificial intelligen', 'machine learning', 'deep learning',
      'semiconductor', 'silicon valley', 'open source', 'software',
      'cybersecur', 'neural network', 'large language model',
      'autonomous vehicl', 'self-driving', 'programming', 'developer',
      'generative ai', 'chatgpt', 'openai', 'github',
    ],
    weak: [
      'tech', 'hardware', 'cyber', 'robot', 'comput', 'chip',
      'cloud comput', 'algorithm', 'blockchain', 'quantum comput',
      'internet', 'encryption', 'startup', 'digital', 'smartphone',
      'gadget', 'browser', 'operating system', 'linux', 'api',
      'augmented reality', 'virtual reality', ' vr ', ' ar ',
    ],
  },
  science: {
    strong: [
      'scien', 'nasa', 'genome', 'archaeolog', 'paleontolog', 'particle',
      'telescope', 'laboratory', 'peer-review', 'peer review', 'hypothesis',
      'biolog', 'astrono', 'geolog', 'physicist', 'chemist',
      'extinction', 'biodiversity', 'ecosystem', 'photosynthes',
    ],
    weak: [
      'research', 'discover', 'experiment', 'space', 'climate',
      'species', 'fossil', 'dna', 'physics', 'environ', 'carbon',
      'evolution', 'renewable', 'solar', 'fusion', 'neurosci',
      'volcanic', 'seismic', 'marine biolog', 'gene', 'organism',
    ],
  },
  health: {
    strong: [
      'medical', 'hospital', 'patient', 'disease', 'vaccine', 'pharma',
      'surgery', 'mental health', 'diagnosis', 'symptom', 'pandemic',
      'epidemic', 'outbreak', 'clinical trial', 'oncolog', 'cardio',
      'alzheimer', 'dementia', 'public health', 'healthcare',
    ],
    weak: [
      'health', 'doctor', 'virus', 'treatment', 'cancer', 'diabet',
      'obesity', 'clinic', 'therapy', 'nutrition', 'wellness',
      'fitness', 'nursing', 'stroke', 'chronic', 'infectious',
      'immuniz', 'prescription', 'antibiotic', 'organ transplant',
    ],
  },
  sports: {
    strong: [
      'championship', 'tournament', 'olympic', 'fifa', 'nba', 'nfl',
      'premier league', 'world cup', 'athlet', 'playoff', 'grand slam',
      'super bowl', 'champions league', 'world series', 'medal',
      'stadium', 'transfer window', 'world record',
    ],
    weak: [
      'sport', 'player', 'coach', 'league', 'goal', 'defeat',
      'cricket', 'football', 'soccer', 'tennis', 'rugby', 'boxing',
      'hockey', 'baseball', 'basketball', 'qualifier', 'roster',
      'draft pick', 'injury report', 'halftime', 'referee',
    ],
  },
  entertainment: {
    exclude: [
      'shot dead', 'killed by police', 'police shooting', 'murder suspect',
      'arrested for', 'drug bust', 'gang member', 'charged with murder',
    ],
    strong: [
      // Gaming
      'video game', 'esport', 'playstation', 'xbox', 'nintendo', 'game developer',
      'game studio', 'indie game', 'game pass', 'battle royale',
      // Film
      'box office', 'screenplay', 'hollywood', 'blockbuster', 'oscar', 'academy award',
      'golden globe', 'bafta', 'film festival', 'cannes', 'film director', 'movie franchise',
      // TV
      'tv show', 'tv series', 'showrunner', 'series finale', 'reality tv', 'sitcom',
      'netflix', 'hbo', 'disney+', 'apple tv+', 'amazon prime video', 'peacock',
      'paramount+', 'limited series', 'docuseries', 'streaming service',
      // Music
      'grammy', 'brit award', 'album release', 'record label', 'music festival',
      'music video', 'world tour', 'coachella', 'glastonbury', 'billboard chart',
      'music producer', 'debut album',
    ],
    weak: [
      'gaming', 'console', 'gamer', 'game release',
      'film', 'movie', 'cinema', 'actor', 'actress', 'premiere', 'trailer',
      'television', 'episode', 'streaming', 'season finale',
      'music', 'song', 'singer', 'band', 'album', 'concert', 'rapper', 'musician',
    ],
  },
  gaming: {
    // Exclusion terms: crime/violence articles about entertainers should not match
    // even when weak keywords like 'rapper', 'singer', or 'actor' appear in the text.
    // A strong keyword match always overrides exclusion.
    exclude: [
      'shot dead', 'killed by police', 'police shooting', 'murder suspect',
      'arrested for', 'drug bust', 'gang member', 'charged with murder',
    ],
    strong: [
      'video game', 'esport', 'playstation', 'xbox', 'nintendo',
      'game developer', 'gameplay', 'game pass', 'battle royale',
      'mmorpg', 'game engine', 'unreal engine', 'early access',
      'indie game', 'game studio', 'dlc',
    ],
    weak: [
      'gaming', 'console', 'gamer', 'multiplayer', 'twitch',
      'rpg', 'game update', 'game patch', 'frame rate', 'modding',
      'speedrun', 'game release', 'co-op', 'open world',
    ],
  },
  film: {
    exclude: [
      'shot dead', 'killed by police', 'police shooting', 'murder suspect',
      'arrested for', 'drug bust', 'gang member', 'charged with murder',
    ],
    strong: [
      'box office', 'screenplay', 'hollywood', 'blockbuster',
      'oscar', 'academy award', 'golden globe', 'bafta',
      'film festival', 'cannes', 'sundance', 'tribeca',
      'cinematograph', 'film director', 'rotten tomatoes', 'film review',
      'movie franchise', 'movie review',
    ],
    weak: [
      'film', 'movie', 'cinema', 'actor', 'actress',
      'premiere', 'animation', 'documentary',
      'trailer', 'film critic', 'casting',
    ],
  },
  tv: {
    exclude: [
      'shot dead', 'killed by police', 'police shooting', 'murder suspect',
      'arrested for', 'drug bust', 'gang member', 'charged with murder',
    ],
    strong: [
      'tv show', 'tv series', 'showrunner', 'series finale',
      'primetime', 'cable network', 'reality tv', 'talk show',
      'miniseries', 'anthology series', 'sitcom', 'drama series',
      'late night', 'television show', 'netflix', 'hbo', 'disney+',
      'apple tv+', 'amazon prime video', 'peacock', 'paramount+',
      'binge-watch', 'limited series', 'docuseries',
    ],
    weak: [
      'television', 'episode',
      'renewal', 'cancell', 'streaming service', 'season premiere',
      'season finale', 'reboot', 'spinoff',
      'emmys', 'emmy',
    ],
  },
  music: {
    exclude: [
      'shot dead', 'killed by police', 'police shooting', 'murder suspect',
      'arrested for', 'drug bust', 'gang member', 'charged with murder',
    ],
    strong: [
      'grammy', 'grammy award', 'brit award', 'mercury prize', 'vma', 'mtv award',
      'album release', 'record label', 'music festival', 'music video', 'world tour',
      'coachella', 'glastonbury', 'lollapalooza', 'south by southwest', 'sxsw',
      'billboard chart', 'music producer', 'debut album', 'platinum record',
    ],
    weak: [
      'music', 'song', 'singer', 'band', 'album', 'concert', 'rapper',
      'hip-hop', 'pop star', 'musician', 'new single', 'lead single',
      'music industry', 'record deal', 'music streaming', 'tour dates',
    ],
  },
};

// Count how many keywords from a list appear in the given text
function countKeywordHits(text, keywords) {
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) hits++;
  }
  return hits;
}

// Categories where external APIs use a single broad bucket rather than discrete
// subcategories. For these, _nativeCategory cannot be trusted â€” e.g. WorldNewsAPI,
// GNews and NewsData.io all map gaming/film/tv/music â†’ one "entertainment" bucket,
// which also captures sports celebrities and crime involving entertainers.
const BROAD_API_CATEGORIES = new Set(['gaming', 'film', 'tv', 'music']);

// Check if an article's title+description match the requested category.
// Uses the two-tier keyword system:
//   - 1 strong hit â†’ match
//   - 2+ weak hits â†’ match
//   - 1 weak hit in the title â†’ match (title mention is a strong signal)
function articleMatchesCategory(article, category) {
  // 'world' is too broad to filter usefully â€” we rely on query-level filtering
  if (category === 'world') return true;
  // Trust native API category assignments (Guardian, WorldNewsAPI, NewsData.io, GNews)
  // for categories with precise native API support. Skip bypass for entertainment
  // subcategories (gaming/film/tv/music): external APIs map all of these to a single
  // broad "entertainment" bucket which includes sports celebrities and crime involving
  // entertainers, so keyword validation is still needed for accurate subcategorisation.
  if (article._nativeCategory && !BROAD_API_CATEGORIES.has(category)) return true;
  const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!catKeywords) return true; // unknown category, don't filter

  const title = (article.title || '').toLowerCase();
  const text = `${title} ${article.description || ''}`.toLowerCase();

  // Any strong keyword is an immediate match (overrides exclusion)
  if (catKeywords.strong.some(kw => text.includes(kw))) return true;

  // If the article matches an exclusion term and has no strong keyword, reject it.
  // This catches crime/police articles about entertainers that slip through weak matching.
  if (catKeywords.exclude?.some(kw => text.includes(kw))) return false;

  // Count weak keyword hits
  const weakHits = countKeywordHits(text, catKeywords.weak);
  if (weakHits >= 2) return true;

  // A single weak keyword in the title is enough (title = high signal)
  if (weakHits === 1 && catKeywords.weak.some(kw => title.includes(kw))) return true;

  return false;
}

function getCountryTerms(country) {
  if (COUNTRY_RELEVANCE_KEYWORDS[country]) return COUNTRY_RELEVANCE_KEYWORDS[country];
  const name = COUNTRY_NAMES[country];
  return name ? [name.toLowerCase()] : [country.toLowerCase()];
}

// Check if country is mentioned in the article title (strict) or title+description (loose).
// Returns match details including frequency count for richer scoring.
function articleMentionsCountry(article, country) {
  const terms = getCountryTerms(country);
  const title = (article.title || '').toLowerCase();
  const desc = (article.description || '').toLowerCase();
  const content = (article.content || '').toLowerCase();
  const text = `${title} ${desc}`;
  const fullText = `${text} ${content}`;

  const inTitle = terms.some(term => title.includes(term));
  const inText = terms.some(term => text.includes(term));

  // Count how many distinct terms match across title + description + content.
  // More distinct matches = stronger relevance (e.g. "Australia" + "Sydney" + "Australian").
  let termHits = 0;
  for (const term of terms) {
    if (fullText.includes(term)) termHits++;
  }

  return { inTitle, inText, termHits };
}

// Compute a nuanced country relevance score (0-10) for an article.
// Uses multiple signals:
//   - Title mention:         strong signal (+4)
//   - Body mention:          weaker signal (+2)
//   - Term frequency:        bonus for multiple distinct term matches (+1-2)
//   - Meta country:          domain/source country match (+2, NOT for international wires)
//   - Combined title bonus:  article title explicitly about BOTH country AND category (+2)
//                            e.g. "Japan AI startup" for jp+technology
// Optional `category` parameter enables the combined-title bonus.
function articleCountryScore(article, country, category = null) {
  const { inTitle, inText, termHits } = articleMentionsCountry(article, country);
  let score = 0;

  // Text-based signals
  if (inTitle) score += 4;
  else if (inText) score += 2;

  // Frequency bonus: multiple distinct terms matching is a strong signal
  // (e.g. "Tokyo" + "Japan" + "Japanese" = 3 hits â†’ +2 bonus)
  if (termHits >= 3) score += 2;
  else if (termHits >= 2) score += 1;

  // Meta-country signal: the source's home country matches
  const metaCountry = article._meta?.sourceCountry;
  if (metaCountry === country) {
    // International sources (Reuters, AP, BBC) cover all countries â€” their HQ country
    // should not inflate the score. Only give the bonus to national outlets.
    if (!isInternationalSource(article)) {
      score += 2;
    }
  }

  // Combined country+category title bonus: rewards articles explicitly about BOTH
  // signals in the headline (e.g. "Japanese AI startup" for jp+technology).
  // Only applies when the country is mentioned in the title and a category keyword
  // also appears in the title â€” a strong signal that the article is squarely on-topic.
  if (inTitle && category && category !== 'world') {
    const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
    if (catKeywords) {
      const title = (article.title || '').toLowerCase();
      const hasCatInTitle =
        catKeywords.strong.some(kw => title.includes(kw)) ||
        catKeywords.weak.some(kw => title.includes(kw));
      if (hasCatInTitle) score += 2;
    }
  }

  return Math.min(score, 10); // cap at 10 (increased from 8 to accommodate combined bonus)
}

// Build a nationally-focused search query for /v2/everything.
// Combines tight exact phrases ("Australian politics") with a looser fallback
// (country AND topic keywords) so we get both precision and recall.
function buildNationalQuery(country, category) {
  const demonym = COUNTRY_DEMONYMS[country];
  const countryName = COUNTRY_NAMES[country] || country;
  const nouns = CATEGORY_QUERY_NOUNS[category] || [category];

  const phrases = [];
  for (const noun of nouns) {
    // Demonym + noun: "Australian politics", "Australian government"
    if (demonym) phrases.push(`"${demonym} ${noun}"`);
    // Country name + noun: "Australia politics"
    phrases.push(`"${countryName} ${noun}"`);
  }

  // Tight phrases get priority (NewsAPI ranks by query match), but also include
  // a looser term so articles mentioning the country in a political context aren't missed.
  // Use up to 5 nouns (increased from 3) so more category terms are covered in the
  // loose fallback â€” e.g. politics includes "prime minister" and "legislation" beyond
  // the first three entries.
  const topicKeywords = nouns.slice(0, 5).join(' OR ');
  const looseTerm = demonym
    ? `(${demonym} OR ${countryName}) AND (${topicKeywords})`
    : `${countryName} AND (${topicKeywords})`;

  return `(${phrases.join(' OR ')} OR ${looseTerm})`;
}

// Map app categories to Guardian API sections
const GUARDIAN_SECTION_MAP = {
  technology: 'technology',
  business: 'business',
  science: 'science',
  health: 'society',
  sports: 'sport',
  entertainment: 'culture',  // Guardian's 'culture' section covers film, TV, music, games
  gaming: 'games',
  film: 'film',
  tv: 'tv-and-radio',
  music: 'music',
  politics: 'politics',
  world: 'world'
};

// Guardian native country sections
const GUARDIAN_COUNTRY_SECTIONS = {
  au: 'australia-news',
  gb: 'uk-news',
  us: 'us-news',
};

// Map app categories to WorldNewsAPI topics
const WORLD_NEWS_TOPIC_MAP = {
  technology: 'technology',
  business: 'business',
  science: 'science',
  health: 'health',
  sports: 'sports',
  entertainment: 'entertainment',
  gaming: 'entertainment',
  film: 'entertainment',
  tv: 'entertainment',
  music: 'entertainment',
  politics: 'politics',
  world: 'politics'  // closest match
};

// Map app categories to NewsData.io categories
const NEWS_DATA_CATEGORY_MAP = {
  technology: 'technology',
  business: 'business',
  science: 'science',
  health: 'health',
  sports: 'sports',
  entertainment: 'entertainment',
  gaming: 'entertainment',
  film: 'entertainment',
  tv: 'entertainment',
  music: 'entertainment',
  politics: 'politics',
  world: 'world'
};

// Countries considered part of the Asia-Pacific region for RSS feed targeting.
// Nikkei Asia covers this whole region so its feed is fetched for all of them.
// NOTE: au and nz are intentionally excluded â€” they are already well-served by
// Guardian (dedicated au section), NewsAPI, and GNews. Nikkei is Japan/China-
// centric and adding it for AU queries dilutes Australian content with Asian
// articles that only mention Australia tangentially.
const ASIA_COUNTRIES = new Set([
  'cn', 'jp', 'kr', 'hk', 'tw', 'sg', 'in', 'id', 'th', 'my', 'ph', 'vn',
  'pk', 'bd', 'lk', 'mm', 'kh', 'np',
]);

// Latin American countries covered by MercoPress RSS feed.
// Covers all of South America + Mexico + Central America.
const LATAM_COUNTRIES = new Set([
  'br', 'ar', 'cl', 'co', 'pe', 've', 'ec', 'uy', 'py', 'bo', 'mx',
  'cr', 'pa', 'gt', 'hn', 'cu', 'do',
]);

// RSS feed registry â€” each entry is fetched for applicable countries and merged
// into the article pool alongside API sources. Errors are caught and skipped.
//
// url:       Feed URL. Override via environment variable if the default stops working.
//            IMPORTANT: Verify each URL is accessible from your production environment
//            before relying on it â€” both sites are behind paywalls and may restrict
//            datacenter IPs. Use a browser or RSS reader to confirm the feed loads.
// countries: Set of country codes this feed is relevant for.
// name/domain/tier: used for article formatting and ranking.
const RSS_SOURCES = [
  {
    name: 'Caixin Global',
    domain: 'caixinglobal.com',
    // Primary English-language source for Chinese business/economy/finance news.
    // TODO: confirm this URL works from your host â€” try it in a browser first.
    // Alternatives if the gateway URL fails:
    //   https://www.caixinglobal.com/rss.xml
    //   https://www.caixinglobal.com/feed
    url: process.env.CAIXIN_RSS_URL || 'https://gateway.caixin.com/api/data/global/feedlyRss.xml',
    countries: new Set(['cn']),
  },
  {
    name: 'Nikkei Asia',
    domain: 'asia.nikkei.com',
    // Official Nikkei Asia RSS feed (NAR = Nikkei Asia Report).
    // TODO: confirm this URL works from your host. Category-specific feeds may exist
    // at /rss/feed/business, /rss/feed/technology etc â€” check info.asia.nikkei.com/rss
    // and swap in a more targeted URL if available.
    url: process.env.NIKKEI_RSS_URL || 'https://asia.nikkei.com/rss/feed/nar',
    countries: ASIA_COUNTRIES,
  },
  {
    name: 'MercoPress',
    domain: 'mercopress.com',
    // English-language news agency covering all of South America and the wider
    // Latin America/Caribbean region. Free RSS feed, no paywall.
    // TODO: confirm accessible from your host. Alternative feed paths:
    //   https://en.mercopress.com/rss.xml
    //   https://en.mercopress.com/news/rss
    url: process.env.MERCOPRESS_RSS_URL || 'https://en.mercopress.com/rss.xml',
    countries: LATAM_COUNTRIES,
  },
  {
    name: 'The Brazilian Report',
    domain: 'brazilianreport.com',
    // English-language outlet focused entirely on Brazil.
    // Standard WordPress RSS feed â€” no paywall for the feed itself.
    url: process.env.BRAZILIAN_REPORT_RSS_URL || 'https://brazilianreport.com/feed/',
    countries: new Set(['br']),
  },
  {
    name: 'Buenos Aires Times',
    domain: 'batimes.com.ar',
    // Argentina's only English-language newspaper. Covers Argentine politics,
    // economy, and society. Standard WordPress RSS feed.
    url: process.env.BATIMES_RSS_URL || 'https://www.batimes.com.ar/feed',
    countries: new Set(['ar']),
  },
  {
    name: 'Mexico News Daily',
    domain: 'mexiconewsdaily.com',
    // English-language news and analysis for Mexico.
    // Standard WordPress RSS feed.
    url: process.env.MEXICO_NEWS_DAILY_RSS_URL || 'https://mexiconewsdaily.com/feed/',
    countries: new Set(['mx']),
  },
  {
    name: 'Daily Maverick',
    domain: 'dailymaverick.co.za',
    // South Africa's leading independent investigative outlet. Covers the full
    // African continent with strong political/business reporting in English.
    // TODO: confirm accessible from your host.
    url: process.env.DAILYMAVERICK_RSS_URL || 'https://www.dailymaverick.co.za/dmrss/',
    countries: new Set(['za', 'ng', 'ke', 'gh', 'et', 'tz', 'ug', 'sn', 'ci', 'cm', 'dz', 'tn', 'rw', 'eg', 'ma']),
  },
  {
    name: 'Deutsche Welle',
    domain: 'dw.com',
    // DW's full English-language feed. Excellent coverage of Germany and the
    // broader European continent. Free RSS with no paywall.
    // Alternative feeds: https://rss.dw.com/rdf/rss-en-europe (Europe section only)
    url: process.env.DW_RSS_URL || 'https://rss.dw.com/rdf/rss-en-all',
    countries: new Set([
      'de', 'at', 'ch', 'nl', 'be', 'fr', 'it', 'es', 'se', 'no', 'dk', 'fi',
      'pl', 'cz', 'hu', 'ro', 'ua', 'rs', 'bg', 'hr', 'sk', 'lt', 'lv', 'ee',
      'lu', 'ie', 'pt', 'gr', 'is', 'si',
    ]),
  },
  {
    name: 'CBC News',
    domain: 'cbc.ca',
    // Canada's national public broadcaster. Comprehensive coverage of Canadian
    // politics, business, and society. Free RSS feed.
    url: process.env.CBC_RSS_URL || 'https://www.cbc.ca/cmlink/rss-topstories',
    countries: new Set(['ca']),
  },
  {
    name: 'Politico Europe',
    domain: 'politico.eu',
    // European politics and policy coverage. Strong on EU institutions,
    // national elections, and cross-border policy debates. Free RSS feed.
    url: process.env.POLITICO_EU_RSS_URL || 'https://www.politico.eu/feed/',
    countries: new Set([
      'de', 'fr', 'it', 'es', 'nl', 'be', 'at', 'ch', 'se', 'no', 'dk', 'fi',
      'pl', 'cz', 'hu', 'ro', 'ua', 'ie', 'pt', 'gr', 'bg', 'rs', 'sk', 'hr',
      'lt', 'lv', 'ee', 'lu', 'si', 'is',
    ]),
  },
  {
    name: 'Radio New Zealand',
    domain: 'rnz.co.nz',
    // New Zealand's public broadcaster. Primary source for NZ national news.
    // Free RSS feed, no paywall.
    url: process.env.RNZ_RSS_URL || 'https://www.rnz.co.nz/rss/national.xml',
    countries: new Set(['nz']),
  },
  {
    name: 'RNZ Pacific',
    domain: 'rnz.co.nz',
    // Radio New Zealand's Pacific regional news service. Only English-language
    // RSS feed covering Fiji, Samoa, Tonga, Vanuatu, Papua New Guinea, and other
    // Pacific island nations. Free RSS feed, no paywall.
    url: process.env.RNZ_PACIFIC_RSS_URL || 'https://www.rnz.co.nz/rss/pacific.xml',
    countries: new Set(['fj', 'ws', 'to', 'vu', 'pg', 'sb', 'ki', 'fm', 'pw']),
  },
  {
    name: 'RTÃ‰ News',
    domain: 'rte.ie',
    // Ireland's national public broadcaster. Primary source for Irish news.
    // Free RSS feed, no paywall.
    url: process.env.RTE_RSS_URL || 'https://www.rte.ie/news/rss/rte-news-national.xml',
    countries: new Set(['ie']),
  },
  {
    name: 'ABC News Australia',
    domain: 'abc.net.au',
    // Australia's national public broadcaster. Primary source for Australian national
    // news, politics, and society. Free RSS feed, no paywall.
    // Gated by well-served country threshold â€” only activates when API sources
    // provide fewer than 25 articles for au.
    url: process.env.ABC_AU_RSS_URL || 'https://www.abc.net.au/news/feed/51120/rss.xml',
    countries: new Set(['au']),
  },
  {
    name: 'SBS News',
    domain: 'sbs.com.au',
    // Australia's multicultural public broadcaster. Covers Australian news with
    // strong international and multicultural perspectives. Free RSS feed.
    // TODO: confirm this feed URL is stable â€” SBS has changed their feed paths before.
    // Alternative: https://www.sbs.com.au/news/feed
    url: process.env.SBS_NEWS_RSS_URL || 'https://www.sbs.com.au/news/topic/latest/feed',
    countries: new Set(['au']),
  },
  {
    name: 'BBC News World',
    domain: 'bbc.co.uk',
    // BBC's primary English-language world news RSS feed. One of the most trusted
    // international sources globally. Applied broadly â€” the well-served country gate
    // prevents it from flooding GB/AU results when API sources already cover quota.
    // TODO: confirm accessible from your production host â€” BBC occasionally
    // restricts datacenter IPs. Alternative: https://feeds.bbci.co.uk/news/rss.xml
    url: process.env.BBC_WORLD_RSS_URL || 'https://feeds.bbci.co.uk/news/world/rss.xml',
    countries: new Set([
      'gb', 'au', 'nz', 'ie', 'in', 'za', 'ng', 'ke', 'gh', 'eg', 'pk',
      'sg', 'my', 'tr', 'il', 'ps', 'ae', 'sa', 'jo', 'lb', 'ua', 'ru',
      'de', 'fr', 'it', 'es', 'pl', 'br', 'ar', 'mx', 'co', 'cn', 'jp', 'kr',
    ]),
  },
  {
    name: 'BBC News UK',
    domain: 'bbc.co.uk',
    // BBC's dedicated UK domestic news feed. Separate from BBC World so British
    // users get focused national coverage (politics, devolved nations, economy).
    // TODO: confirm accessible from your production host.
    url: process.env.BBC_UK_RSS_URL || 'https://feeds.bbci.co.uk/news/uk/rss.xml',
    countries: new Set(['gb']),
  },
  {
    name: 'Al Jazeera English',
    domain: 'aljazeera.com',
    // Al Jazeera's English-language international feed. Qatar-based; provides
    // strong coverage of MENA, South Asia, Africa, and global affairs from a
    // non-Western editorial perspective. Free RSS feed, no paywall.
    // Note: domain is aljazeera.com (English) â€” distinct from aljazeera.net (Arabic feed).
    // TODO: confirm feed URL is accessible from your production host.
    url: process.env.AJ_ENGLISH_RSS_URL || 'https://www.aljazeera.com/xml/rss/all.xml',
    countries: new Set([
      'qa', 'ae', 'sa', 'eg', 'jo', 'lb', 'iq', 'ps', 'il', 'tr',
      'in', 'pk', 'af', 'id', 'my', 'ng', 'et', 'za', 'ke',
      'us', 'gb', 'au', 'de', 'fr',
    ]),
  },
  // â”€â”€ Middle East â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'Arab News',
    domain: 'arabnews.com',
    // Leading English-language newspaper for the Arab world. Covers Saudi Arabia,
    // UAE, Gulf states, Egypt, Jordan, Lebanon, and wider Middle East. Free RSS feed.
    url: process.env.ARABNEWS_RSS_URL || 'https://www.arabnews.com/rss.xml',
    countries: new Set(['sa', 'ae', 'kw', 'qa', 'bh', 'om', 'jo', 'lb', 'iq', 'eg', 'ma', 'dz', 'tn']),
  },
  {
    name: 'Times of Israel',
    domain: 'timesofisrael.com',
    // Comprehensive English-language coverage of Israel and the Palestinian territories.
    // Free RSS feed with breaking news, politics, and regional affairs.
    url: process.env.TIMES_OF_ISRAEL_RSS_URL || 'https://www.timesofisrael.com/feed/',
    countries: new Set(['il', 'ps']),
  },
  {
    name: 'Middle East Eye',
    domain: 'middleeasteye.net',
    // Independent news outlet covering the broader Middle East and North Africa region.
    // Free RSS feed, no paywall for feed content.
    url: process.env.MIDDLE_EAST_EYE_RSS_URL || 'https://www.middleeasteye.net/rss',
    countries: new Set(['il', 'ps', 'ae', 'sa', 'tr', 'jo', 'lb', 'iq', 'ir', 'eg', 'ma']),
  },
  {
    name: 'Daily Sabah',
    domain: 'dailysabah.com',
    // Turkey's leading English-language newspaper. Covers Turkish politics, economy,
    // and regional affairs. Free RSS feed.
    url: process.env.DAILY_SABAH_RSS_URL || 'https://www.dailysabah.com/rssfeed/home',
    countries: new Set(['tr']),
  },
  {
    name: 'Gulf News',
    domain: 'gulfnews.com',
    // UAE-based pan-Gulf English-language newspaper. Strong coverage of the UAE,
    // Saudi Arabia, and broader Gulf Cooperation Council states. Free RSS feed.
    // TODO: verify this RSS endpoint is accessible from your host â€” gulfnews.com
    // has historically restricted non-browser user agents.
    // Alternative: https://gulfnews.com/rss
    url: process.env.GULF_NEWS_RSS_URL || 'https://gulfnews.com/tools/rss',
    countries: new Set(['ae', 'sa', 'kw', 'bh', 'om', 'qa']),
  },
  {
    name: 'Jerusalem Post',
    domain: 'jpost.com',
    // Israel's largest English-language newspaper. Comprehensive coverage of
    // Israeli politics, security, and regional affairs. Complements Times of Israel.
    // Free RSS feed.
    url: process.env.JERUSALEM_POST_RSS_URL || 'https://www.jpost.com/rss/rssfeedsheadlines.aspx',
    countries: new Set(['il', 'ps']),
  },
  // â”€â”€ Asia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'Japan Times',
    domain: 'japantimes.co.jp',
    // Japan's oldest and most widely read English-language newspaper. Covers
    // Japanese politics, business, culture, and regional Asia-Pacific affairs.
    // Free RSS feed.
    url: process.env.JAPAN_TIMES_RSS_URL || 'https://www.japantimes.co.jp/feed/',
    countries: new Set(['jp']),
  },
  {
    name: 'NHK World',
    domain: 'nhk.or.jp',
    // Japan's public broadcaster international English service. Reliable breaking
    // news from Japan and Asia. Free RSS feed, no paywall.
    url: process.env.NHK_WORLD_RSS_URL || 'https://www3.nhk.or.jp/nhkworld/en/news/feeds/rss_en_all.xml',
    countries: new Set(['jp']),
  },
  {
    name: 'Korea Herald',
    domain: 'koreaherald.com',
    // South Korea's largest English-language newspaper. Covers Korean politics,
    // business, tech, and society. Free RSS feed.
    url: process.env.KOREA_HERALD_RSS_URL || 'https://www.koreaherald.com/common/rss_xml.php?ct=020100000000',
    countries: new Set(['kr']),
  },
  {
    name: 'Bangkok Post',
    domain: 'bangkokpost.com',
    // Thailand's leading English-language newspaper. Covers Thai politics, economy,
    // society, and Southeast Asia. Free RSS feed.
    url: process.env.BANGKOK_POST_RSS_URL || 'https://www.bangkokpost.com/rss/data/topstories.xml',
    countries: new Set(['th']),
  },
  {
    name: 'Jakarta Globe',
    domain: 'jakartaglobe.id',
    // Indonesia's English-language news outlet covering politics, business, and
    // culture. Free RSS feed.
    url: process.env.JAKARTA_GLOBE_RSS_URL || 'https://jakartaglobe.id/feed',
    countries: new Set(['id']),
  },
  {
    name: 'Rappler',
    domain: 'rappler.com',
    // Award-winning Philippine digital journalism outlet. Covers Philippine
    // politics, society, and Southeast Asia. Free RSS feed.
    url: process.env.RAPPLER_RSS_URL || 'https://www.rappler.com/feed',
    countries: new Set(['ph']),
  },
  {
    name: 'Vietnam News',
    domain: 'vietnamnews.vn',
    // Official English-language newspaper of Vietnam. Covers domestic politics,
    // economy, and society. Free RSS feed.
    url: process.env.VIETNAM_NEWS_RSS_URL || 'https://vietnamnews.vn/rss/home.rss',
    countries: new Set(['vn']),
  },
  {
    name: 'Straits Times',
    domain: 'straitstimes.com',
    // Singapore's flagship English-language broadsheet. Excellent coverage of
    // Singapore, Malaysia, Indonesia, and Southeast Asia. Free RSS feed.
    url: process.env.STRAITS_TIMES_RSS_URL || 'https://www.straitstimes.com/news/singapore/rss.xml',
    countries: new Set(['sg', 'my', 'id', 'th', 'ph', 'vn']),
  },
  {
    name: 'Channel NewsAsia',
    domain: 'channelnewsasia.com',
    // Singapore's international broadcaster covering Asia-Pacific news in depth.
    // Free RSS feed, broad Southeast and East Asia coverage.
    url: process.env.CNA_RSS_URL || 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416',
    countries: new Set(['sg', 'my', 'id', 'ph', 'th', 'vn', 'mm', 'kh', 'bd', 'lk', 'np']),
  },
  {
    name: 'The Irrawaddy',
    domain: 'irrawaddy.com',
    // Independent English-language outlet covering Myanmar politics, human rights,
    // and society. One of the most credible sources on Myanmar affairs.
    // Free WordPress RSS feed.
    url: process.env.IRRAWADDY_RSS_URL || 'https://www.irrawaddy.com/feed',
    countries: new Set(['mm']),
  },
  {
    name: 'Khmer Times',
    domain: 'khmertimeskh.com',
    // Cambodia's leading English-language newspaper. Covers Cambodian politics,
    // economy, and society. Free WordPress RSS feed.
    url: process.env.KHMER_TIMES_RSS_URL || 'https://www.khmertimeskh.com/feed/',
    countries: new Set(['kh']),
  },
  {
    name: 'Kathmandu Post',
    domain: 'kathmandupost.com',
    // Nepal's most widely read English-language newspaper. Covers Nepali politics,
    // economy, and society. Free RSS feed.
    // TODO: confirm feed URL is accessible from your production host.
    url: process.env.KATHMANDU_POST_RSS_URL || 'https://kathmandupost.com/rss',
    countries: new Set(['np']),
  },
  {
    name: 'Dawn (Pakistan)',
    domain: 'dawn.com',
    // Pakistan's most widely read English-language newspaper. Covers politics,
    // security, economy, and South Asian affairs. Free RSS feed.
    url: process.env.DAWN_RSS_URL || 'https://www.dawn.com/feeds/home',
    countries: new Set(['pk']),
  },
  {
    name: 'The Daily Star (Bangladesh)',
    domain: 'thedailystar.net',
    // Bangladesh's leading English-language newspaper. Covers politics, business,
    // and society. Free RSS feed.
    url: process.env.DAILY_STAR_BD_RSS_URL || 'https://www.thedailystar.net/feeds/frontpage',
    countries: new Set(['bd']),
  },
  {
    name: 'The Hindu',
    domain: 'thehindu.com',
    // India's leading English-language national newspaper of record. Covers
    // Indian politics, economy, science, and international affairs. High editorial
    // quality. Free RSS feed.
    url: process.env.THE_HINDU_RSS_URL || 'https://www.thehindu.com/news/national/feeder/default.rss',
    countries: new Set(['in']),
  },
  {
    name: 'Times of India',
    domain: 'timesofindia.indiatimes.com',
    // India's largest-circulation English-language newspaper. Broad national
    // coverage: politics, business, technology, and society. Free RSS feed.
    url: process.env.TIMES_OF_INDIA_RSS_URL || 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    countries: new Set(['in']),
  },
  // â”€â”€ Africa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'Nation Africa',
    domain: 'nation.africa',
    // East Africa's most widely read media group. Strong Kenya, Tanzania, Uganda,
    // and Rwanda coverage. Free RSS feed.
    url: process.env.NATION_AFRICA_RSS_URL || 'https://nation.africa/feed',
    countries: new Set(['ke', 'tz', 'ug', 'rw']),
  },
  {
    name: 'BusinessDay Nigeria',
    domain: 'businessday.ng',
    // Nigeria's leading business and financial newspaper. Covers Nigerian economy,
    // politics, and West Africa. Free RSS feed.
    url: process.env.BUSINESSDAY_NG_RSS_URL || 'https://businessday.ng/feed',
    countries: new Set(['ng', 'gh']),
  },
  {
    name: 'Africanews',
    domain: 'africanews.com',
    // Pan-African English-language news outlet covering the entire continent.
    // Strong reporting on Sub-Saharan Africa. Free RSS feed.
    url: process.env.AFRICANEWS_RSS_URL || 'https://www.africanews.com/feed',
    countries: new Set(['ng', 'gh', 'et', 'tz', 'ug', 'sn', 'ci', 'cm', 'rw', 'za', 'ke']),
  },
  {
    name: 'The East African',
    domain: 'theeastafrican.co.ke',
    // Regional weekly newspaper covering Kenya, Tanzania, Uganda, Rwanda, and
    // East Africa broadly. Free RSS feed.
    url: process.env.EAST_AFRICAN_RSS_URL || 'https://www.theeastafrican.co.ke/feed',
    countries: new Set(['ke', 'tz', 'ug', 'rw', 'et']),
  },
  {
    name: 'Premium Times',
    domain: 'premiumtimesng.com',
    // Nigeria's leading independent investigative journalism outlet. Covers
    // Nigerian politics, governance, and accountability. Complements BusinessDay
    // (business-focused) with stronger investigative and political coverage.
    // Free WordPress RSS feed.
    url: process.env.PREMIUM_TIMES_RSS_URL || 'https://www.premiumtimesng.com/feed',
    countries: new Set(['ng']),
  },
  {
    name: 'Addis Standard',
    domain: 'addisstandard.com',
    // Ethiopia's leading independent English-language news outlet. Covers Ethiopian
    // politics, society, and the Horn of Africa region. Free WordPress RSS feed.
    url: process.env.ADDIS_STANDARD_RSS_URL || 'https://addisstandard.com/feed/',
    countries: new Set(['et']),
  },
  {
    name: 'New Zimbabwe',
    domain: 'newzimbabwe.com',
    // Zimbabwe's independent online news outlet. Covers Zimbabwean politics,
    // economy, and society. Only dedicated English-language Zimbabwe source
    // in the registry. Free WordPress RSS feed.
    url: process.env.NEW_ZIMBABWE_RSS_URL || 'https://www.newzimbabwe.com/feed/',
    countries: new Set(['zw']),
  },
  // â”€â”€ Europe (English-language regional outlets) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'The Local (Germany)',
    domain: 'thelocal.de',
    // English-language news about Germany for expats and international audiences.
    // Covers German politics, society, and lifestyle. Free RSS feed.
    url: process.env.THE_LOCAL_DE_RSS_URL || 'https://www.thelocal.de/feeds/rss.php',
    countries: new Set(['de', 'at']),
  },
  {
    name: 'The Local (France)',
    domain: 'thelocal.fr',
    // English-language news about France for expats and international audiences.
    // Free RSS feed.
    url: process.env.THE_LOCAL_FR_RSS_URL || 'https://www.thelocal.fr/feeds/rss.php',
    countries: new Set(['fr']),
  },
  {
    name: 'The Local (Spain)',
    domain: 'thelocal.es',
    // English-language news about Spain. Free RSS feed.
    url: process.env.THE_LOCAL_ES_RSS_URL || 'https://www.thelocal.es/feeds/rss.php',
    countries: new Set(['es']),
  },
  {
    name: 'The Local (Sweden)',
    domain: 'thelocal.se',
    // English-language news about Sweden. Free RSS feed.
    url: process.env.THE_LOCAL_SE_RSS_URL || 'https://www.thelocal.se/feeds/rss.php',
    countries: new Set(['se']),
  },
  {
    name: 'The Local (Italy)',
    domain: 'thelocal.it',
    // English-language news about Italy. Free RSS feed.
    url: process.env.THE_LOCAL_IT_RSS_URL || 'https://www.thelocal.it/feeds/rss.php',
    countries: new Set(['it']),
  },
  {
    name: 'The Local (Norway)',
    domain: 'thelocal.no',
    // English-language news about Norway. Free RSS feed.
    url: process.env.THE_LOCAL_NO_RSS_URL || 'https://www.thelocal.no/feeds/rss.php',
    countries: new Set(['no']),
  },
  {
    name: 'Notes from Poland',
    domain: 'notesfrompoland.com',
    // English-language Polish news and analysis. Strong political and judicial
    // reporting. Free RSS feed.
    url: process.env.NOTES_FROM_POLAND_RSS_URL || 'https://notesfrompoland.com/feed',
    countries: new Set(['pl']),
  },
  {
    name: 'Kyiv Independent',
    domain: 'kyivindependent.com',
    // Ukraine's leading English-language outlet. Critical coverage of the war,
    // Ukrainian politics, and Eastern Europe. Free RSS feed.
    url: process.env.KYIV_INDEPENDENT_RSS_URL || 'https://kyivindependent.com/feed/',
    countries: new Set(['ua', 'rs', 'bg', 'ro', 'hu', 'sk', 'hr']),
  },
  {
    name: 'Meduza',
    domain: 'meduza.io',
    // Independent Russian-language and English outlet covering Russia and the
    // post-Soviet space from exile. Free RSS feed.
    url: process.env.MEDUZA_RSS_URL || 'https://meduza.io/rss/en/all',
    countries: new Set(['ru', 'ua', 'by', 'kz']),
  },
  {
    name: 'SWI swissinfo.ch',
    domain: 'swissinfo.ch',
    // Switzerland's international public broadcaster in English. Covers Swiss
    // politics, economy, and international affairs. Free RSS feed.
    url: process.env.SWISSINFO_RSS_URL || 'https://www.swissinfo.ch/eng/rss/news.xml',
    countries: new Set(['ch', 'lu']),
  },
  {
    name: 'Euractiv',
    domain: 'euractiv.com',
    // Leading EU policy and politics outlet. Covers EU institutions, elections,
    // and national politics across Europe. Free RSS feed.
    url: process.env.EURACTIV_RSS_URL || 'https://www.euractiv.com/feed/',
    countries: new Set([
      'de', 'fr', 'it', 'es', 'nl', 'be', 'pl', 'cz', 'hu', 'ro', 'pt', 'gr',
      'at', 'se', 'dk', 'fi', 'bg', 'hr', 'sk', 'lt', 'lv', 'ee', 'lu', 'ie',
    ]),
  },
  {
    name: 'Brussels Times',
    domain: 'brusselstimes.com',
    // Belgium's English-language newspaper. Covers Belgian national politics,
    // EU affairs, and Flemish/Walloon society. Free WordPress RSS feed.
    url: process.env.BRUSSELS_TIMES_RSS_URL || 'https://www.brusselstimes.com/feed',
    countries: new Set(['be']),
  },
  {
    name: 'DutchNews.nl',
    domain: 'dutchnews.nl',
    // English-language news about the Netherlands. Covers Dutch politics, economy,
    // and society. Complements the native NOS feed for English-speaking audiences.
    // Free RSS feed.
    url: process.env.DUTCH_NEWS_RSS_URL || 'https://www.dutchnews.nl/feed',
    countries: new Set(['nl']),
  },
  {
    name: 'Ekathimerini',
    domain: 'ekathimerini.com',
    // Greece's English-language edition of the Kathimerini newspaper of record.
    // Covers Greek politics, economy, and society. Free RSS feed.
    // TODO: confirm accessible from your production host.
    url: process.env.EKATHIMERINI_RSS_URL || 'https://www.ekathimerini.com/rss',
    countries: new Set(['gr']),
  },
  {
    name: 'The Baltic Times',
    domain: 'baltictimes.com',
    // English-language newspaper covering Estonia, Latvia, and Lithuania.
    // Only dedicated English-language source for all three Baltic states.
    // Free RSS feed.
    url: process.env.BALTIC_TIMES_RSS_URL || 'https://www.baltictimes.com/rss/news/',
    countries: new Set(['lt', 'lv', 'ee']),
  },
  {
    name: 'Hungary Today',
    domain: 'hungarytoday.hu',
    // Hungary's English-language news outlet. Covers Hungarian politics, society,
    // and Central European affairs. Complements Kyiv Independent's incidental
    // Hungary coverage with dedicated Hungarian reporting. Free WordPress RSS feed.
    url: process.env.HUNGARY_TODAY_RSS_URL || 'https://hungarytoday.hu/feed/',
    countries: new Set(['hu']),
  },
  {
    name: 'Romania Insider',
    domain: 'romania-insider.com',
    // English-language news and lifestyle outlet covering Romania. Covers Romanian
    // politics, business, and society. Free WordPress RSS feed.
    url: process.env.ROMANIA_INSIDER_RSS_URL || 'https://www.romania-insider.com/feed',
    countries: new Set(['ro']),
  },
  {
    name: 'CPH Post',
    domain: 'cphpost.dk',
    // Copenhagen's English-language newspaper. Covers Danish politics, society,
    // and Scandinavian affairs. Only dedicated English-language Danish source
    // in the registry. Free RSS feed.
    url: process.env.CPH_POST_RSS_URL || 'https://cphpost.dk/?format=feed&type=rss',
    countries: new Set(['dk']),
  },
  // â”€â”€ Americas (supplemental regional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'Tico Times',
    domain: 'ticotimes.net',
    // Costa Rica's English-language newspaper. Covers Central American politics
    // and society. Free RSS feed.
    url: process.env.TICO_TIMES_RSS_URL || 'https://ticotimes.net/feed',
    countries: new Set(['cr', 'pa', 'gt', 'hn', 'do']),
  },
  {
    name: 'Colombia Reports',
    domain: 'colombiareports.com',
    // English-language news outlet focused on Colombia. Covers politics, security,
    // and economy. Free RSS feed.
    url: process.env.COLOMBIA_REPORTS_RSS_URL || 'https://colombiareports.com/feed/',
    countries: new Set(['co', 've', 'ec']),
  },
  {
    name: 'Chile Today',
    domain: 'chiletoday.cl',
    // Chile's English-language news outlet. Covers Chilean politics, economy,
    // and society. Provides Chile-specific coverage that MercoPress (pan-regional)
    // only partially delivers. Free WordPress RSS feed.
    url: process.env.CHILE_TODAY_RSS_URL || 'https://chiletoday.cl/feed/',
    countries: new Set(['cl']),
  },
  {
    name: 'Caribbean Journal',
    domain: 'caribjournal.com',
    // English-language news outlet covering the Caribbean basin. Covers Dominican
    // Republic, Cuba, Jamaica, Trinidad, Barbados, Bahamas, Haiti, and island
    // nations not covered by Tico Times (Central America-focused).
    // Free WordPress RSS feed.
    url: process.env.CARIBBEAN_JOURNAL_RSS_URL || 'https://www.caribjournal.com/feed/',
    countries: new Set(['do', 'cu', 'jm', 'tt', 'bb', 'bs', 'ht', 'pr']),
  },
  // â”€â”€ Non-English native-language feeds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These feeds are in the local language of the country they serve.
  // Articles are automatically shown for non-English-primary countries
  // (showNonEnglish is forced true for all countries outside ENGLISH_PRIMARY_COUNTRIES).
  // Each feed carries a `language` field so formatRSSArticle can tag articles correctly.
  {
    name: 'Spiegel Online',
    domain: 'spiegel.de',
    language: 'de',
    // Germany's largest news magazine. Broad national and international coverage.
    url: process.env.SPIEGEL_RSS_URL || 'https://www.spiegel.de/schlagzeilen/index.rss',
    countries: new Set(['de', 'at', 'ch']),
  },
  {
    name: 'Le Monde',
    domain: 'lemonde.fr',
    language: 'fr',
    // France's newspaper of record. Covers French politics, economy, and world affairs.
    url: process.env.LEMONDE_RSS_URL || 'https://www.lemonde.fr/rss/une.xml',
    countries: new Set(['fr', 'be', 'ch']),
  },
  {
    name: 'El PaÃ­s',
    domain: 'elpais.com',
    language: 'es',
    // Spain's leading daily newspaper. Covers Spanish and Latin American affairs.
    url: process.env.ELPAIS_RSS_URL || 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
    countries: new Set(['es']),
  },
  {
    name: 'Folha de S.Paulo',
    domain: 'folha.uol.com.br',
    language: 'pt',
    // Brazil's largest daily newspaper. Covers Brazilian politics, economy, and society.
    url: process.env.FOLHA_RSS_URL || 'https://feeds.folha.com/folha/mundo/rss091.xml',
    countries: new Set(['br']),
  },
  {
    name: 'RTP NotÃ­cias',
    domain: 'rtp.pt',
    language: 'pt',
    // Portugal's public broadcaster. Covers Portuguese news and Lusophone world affairs.
    url: process.env.RTP_RSS_URL || 'https://www.rtp.pt/noticias/?format=feed&type=rss',
    countries: new Set(['pt']),
  },
  {
    name: 'BBC Arabic',
    domain: 'bbc.co.uk',
    language: 'ar',
    // BBC's Arabic-language service. Trusted source for Arabic-speaking audiences
    // across the Middle East and North Africa.
    url: process.env.BBC_ARABIC_RSS_URL || 'https://feeds.bbci.co.uk/arabic/rss.xml',
    countries: new Set(['sa', 'ae', 'eg', 'dz', 'ma', 'tn', 'lb', 'jo', 'iq', 'ps', 'kw', 'qa', 'bh', 'om', 'ly', 'sd', 'sy', 'ye']),
  },
  {
    name: 'Al Jazeera Arabic',
    domain: 'aljazeera.net',
    language: 'ar',
    // Al Jazeera's Arabic-language feed. Qatar-based; broad coverage of Arab world news.
    // TODO: confirm feed URL is accessible from your host. Alternative:
    //   https://www.aljazeera.net/aljazeeraxml/mritems/htmlfiles/rss20.xml
    url: process.env.AJ_ARABIC_RSS_URL || 'https://www.aljazeera.net/xmlrssfeeds/mritems/htmlfiles/rss20.xml',
    countries: new Set(['sa', 'ae', 'eg', 'dz', 'ma', 'tn', 'lb', 'jo', 'iq', 'ps', 'kw', 'qa', 'bh', 'om', 'ly', 'sd', 'sy', 'ye']),
  },
  {
    name: 'NHK News (Japanese)',
    domain: 'nhk.or.jp',
    language: 'ja',
    // NHK public broadcaster Japanese-language news. Supplements the existing
    // NHK World English feed with native Japanese content.
    url: process.env.NHK_JP_RSS_URL || 'https://www.nhk.or.jp/rss/news/cat0.xml',
    countries: new Set(['jp']),
  },
  {
    name: 'Yonhap News',
    domain: 'yna.co.kr',
    language: 'ko',
    // South Korea's national news agency. Comprehensive Korean-language coverage
    // of Korean and international affairs.
    // TODO: confirm feed URL is accessible from your host.
    url: process.env.YONHAP_RSS_URL || 'https://www.yna.co.kr/RSS/headline.xml',
    countries: new Set(['kr']),
  },
  {
    name: 'Meduza (Russian)',
    domain: 'meduza.io',
    language: 'ru',
    // Meduza's Russian-language feed. Independent exile outlet covering Russia and
    // post-Soviet states. Complements the existing English Meduza feed.
    url: process.env.MEDUZA_RU_RSS_URL || 'https://meduza.io/rss/ru/all',
    countries: new Set(['ru', 'by', 'kz']),
  },
  {
    name: 'NOS Nieuws',
    domain: 'nos.nl',
    language: 'nl',
    // Dutch public broadcaster. Covers Netherlands politics, economy, and world news.
    url: process.env.NOS_RSS_URL || 'https://feeds.nos.nl/nosnieuws',
    countries: new Set(['nl', 'be']),
  },
  {
    name: 'ANSA',
    domain: 'ansa.it',
    language: 'it',
    // Italy's national news agency. Comprehensive Italian-language wire coverage.
    url: process.env.ANSA_RSS_URL || 'https://www.ansa.it/sito/notizie/top/top_rss.xml',
    countries: new Set(['it']),
  },
  {
    name: 'TVN24',
    domain: 'tvn24.pl',
    language: 'pl',
    // Poland's leading independent TV news channel. Covers Polish politics and society.
    url: process.env.TVN24_RSS_URL || 'https://tvn24.pl/najnowsze.xml',
    countries: new Set(['pl']),
  },
];

// Countries already well-served by targeted API sources (NewsAPI top-headlines,
// Guardian native sections, WorldNewsAPI). For these, RSS feeds are a supplement
// used only when the article count is low â€” not always-on. This prevents broad
// regional feeds (e.g. Nikkei) from flooding results for countries that have
// strong dedicated API coverage. Underserved countries always get RSS.
const RSS_WELL_SERVED_COUNTRIES = new Set(['us', 'gb', 'au', 'ca', 'nz', 'ie']);

// Countries where English is the primary official language.
// For all other countries, both English AND native-language articles are
// automatically included (showNonEnglish is forced true) so users get local
// perspectives alongside international wire coverage â€” no toggle required.
const ENGLISH_PRIMARY_COUNTRIES = new Set(['us', 'gb', 'au', 'ca', 'nz', 'ie']);

// Map app categories to GNews API categories
// GNews categories: general, world, nation, business, technology, entertainment, sports, science, health
const GNEWS_CATEGORY_MAP = {
  technology: 'technology',
  business: 'business',
  science: 'science',
  health: 'health',
  sports: 'sports',
  entertainment: 'entertainment',
  gaming: 'entertainment',
  film: 'entertainment',
  tv: 'entertainment',
  music: 'entertainment',
  politics: 'nation',   // 'nation' covers national politics better than 'general'
  world: 'world',
};

// Fetch with a timeout â€” wraps any fetch() call with an AbortController
// so a single slow API can't block the entire serverless response.
async function fetchWithTimeout(url, opts = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// â”€â”€ Source authority tiers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Higher-tier sources are weighted more heavily in ranking.
// Tier 3 (+3): Major wire services / international quality broadsheets
// Tier 2 (+2): Strong national outlets & specialist publications
// Tier 1 (+1): Reputable but narrower outlets (default for any trusted source)
const SOURCE_AUTHORITY_TIER = {
  // Tier 3 â€” wire services & top international
  'reuters.com': 3, 'apnews.com': 3, 'bbc.co.uk': 3, 'bbc.com': 3,
  'nytimes.com': 3, 'theguardian.com': 3, 'washingtonpost.com': 3,
  'economist.com': 3, 'ft.com': 3, 'bloomberg.com': 3,
  // Tier 2 â€” strong nationals & specialists
  'cnn.com': 2, 'npr.org': 2, 'abc.net.au': 2, 'aljazeera.com': 2,
  'wsj.com': 2, 'politico.com': 2, 'abcnews.go.com': 2, 'cbsnews.com': 2,
  'nbcnews.com': 2, 'pbs.org': 2, 'france24.com': 2, 'dw.com': 2,
  'arstechnica.com': 2, 'wired.com': 2, 'techcrunch.com': 2, 'theverge.com': 2,
  'espn.com': 2, 'scmp.com': 2, 'theconversation.com': 2,
  'timesofindia.indiatimes.com': 2, 'thehindu.com': 2,
  'caixinglobal.com': 2, 'asia.nikkei.com': 2,
  // Tier 2 â€” strong regional/national outlets (supplemental countries)
  'dailymaverick.co.za': 2, 'koreaherald.com': 2, 'channelnewsasia.com': 2,
  'kyivindependent.com': 2, 'timesofisrael.com': 2, 'arabnews.com': 2,
  'thenationalnews.com': 2, 'bangkokpost.com': 2, 'mercopress.com': 2,
  // Tier 2 â€” strong English-language national outlets
  'cbc.ca': 2, 'globeandmail.com': 2, 'irishtimes.com': 2,
  'rnz.co.nz': 2, 'nzherald.co.nz': 2, 'rte.ie': 2,
  'politico.eu': 2, 'swissinfo.ch': 2,
  // Tier 2 â€” strong regionals (new outlets with solid editorial track records)
  'japantimes.co.jp': 2, 'nhk.or.jp': 2, 'dawn.com': 2, 'koreaherald.com': 2,
  'bangkokpost.com': 2, 'timesofisrael.com': 2, 'arabnews.com': 2,
  'middleeasteye.net': 2, 'dailysabah.com': 2, 'euractiv.com': 2,
  'kyivindependent.com': 2, 'theeastafrican.co.ke': 2, 'nation.africa': 2,
  'jpost.com': 2, 'gulfnews.com': 2, 'irrawaddy.com': 2, 'sbs.com.au': 2,
  // Politics specialists
  'thehill.com': 2, 'axios.com': 2, 'foreignpolicy.com': 2,
  // Tier 1 â€” quality regionals (default tier, listed explicitly for clarity)
  'brazilianreport.com': 1, 'batimes.com.ar': 1, 'mexiconewsdaily.com': 1,
  'businessday.ng': 1, 'africanews.com': 1,
  'jakartaglobe.id': 1, 'inquirer.net': 1, 'rappler.com': 1,
  'notesfrompoland.com': 1, 'meduza.io': 1,
  'nationalpost.com': 1, 'thestar.com': 1, 'thelocal.com': 1,
  'dutchnews.nl': 1, 'polandin.com': 1,
  'thelocal.de': 1, 'thelocal.fr': 1, 'thelocal.es': 1, 'thelocal.se': 1,
  'thelocal.it': 1, 'thelocal.no': 1,
  'vietnamnews.vn': 1, 'thedailystar.net': 1, 'ticotimes.net': 1,
  'colombiareports.com': 1, 'swissinfo.ch': 1,
  'khmertimeskh.com': 1, 'kathmandupost.com': 1,
  'premiumtimesng.com': 1, 'addisstandard.com': 1, 'newzimbabwe.com': 1,
  'brusselstimes.com': 1, 'ekathimerini.com': 1, 'baltictimes.com': 1,
  'hungarytoday.hu': 1, 'romania-insider.com': 1, 'cphpost.dk': 1,
  'chiletoday.cl': 1, 'caribjournal.com': 1,
};

// Normalise a source name or URL to a domain key for tier lookup
function getSourceDomain(article) {
  try {
    if (article.url) return new URL(article.url).hostname.replace(/^www\./, '');
  } catch { }
  return '';
}

function getSourceTier(article) {
  const domain = getSourceDomain(article);
  return SOURCE_AUTHORITY_TIER[domain] || 1; // default tier 1 for known trusted sources
}

// â”€â”€ Advanced multi-signal ranking engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Clusters duplicate stories, then scores each cluster using 6 weighted signals:
//
//   1. Source Authority    â€” tier of the outlet (wire service > national > niche)
//   2. Cross-Source Coverage â€” how many distinct outlets cover this story
//   3. Freshness          â€” exponential decay (recent articles score much higher)
//   4. Content Depth      â€” articles with fuller text rank above thin stubs
//   5. Category Relevance â€” how strongly the article matches the requested topic
//   6. Source Diversity    â€” penalty if the same domain already dominates results
//
// The final ranking weight shifts based on time window:
//   24h:   freshness dominates (breaking news)
//   3d+:   authority + coverage dominate (biggest stories)

// â”€â”€ Stop words for smarter title matching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STOP_WORDS = new Set([
  // Standard English stop words
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'it', 'its', 'that',
  'this', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'when',
  'where', 'why', 'not', 'no', 'nor', 'than', 'too', 'very', 'just',
  'about', 'over', 'after', 'before', 'between', 'under', 'above', 'into',
  'through', 'during', 'each', 'some', 'such', 'only', 'also', 'more',
  'most', 'other', 'new', 'says', 'said', 'according', 'report', 'news',
  // News-headline verbs â€” these appear in many titles but carry no topical
  // meaning, so they inflate similarity between unrelated stories.
  // e.g. "Biden announces X" vs "Netanyahu announces Y" would false-match
  // on "announces" if it weren't filtered out.
  'announces', 'announced', 'reveals', 'revealed', 'confirms', 'confirmed',
  'updates', 'updated', 'launches', 'launched', 'reports', 'reported',
  'shows', 'warns', 'warned', 'plans', 'faces', 'calls', 'called',
  'urges', 'urged', 'seeks', 'signs', 'signed', 'set', 'sets',
  'makes', 'made', 'takes', 'taken', 'gets', 'got', 'comes', 'going',
  'first', 'latest', 'ahead', 'back', 'still', 'amid', 'top',
]);

function normaliseTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[''"""\-â€“â€”:,.|!?'()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract meaningful words (no stop words, length > 2)
function extractKeywords(normTitle) {
  return normTitle.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// Improved title similarity: uses keyword overlap with IDF-like weighting.
// Rare words (proper nouns, specific terms) contribute more than common ones.
function titleSimilarity(keywordsA, keywordsB, idfMap) {
  if (keywordsA.length === 0 || keywordsB.length === 0) return 0;
  const setB = new Set(keywordsB);
  let weightedIntersection = 0;
  let weightedUnion = 0;

  const allWords = new Set([...keywordsA, ...keywordsB]);
  for (const w of allWords) {
    const weight = idfMap.get(w) || 1;
    const inA = keywordsA.includes(w);
    const inB = setB.has(w);
    if (inA && inB) weightedIntersection += weight;
    weightedUnion += weight;
  }
  return weightedUnion > 0 ? weightedIntersection / weightedUnion : 0;
}

// Content depth score (0-1): rewards articles with substantial text
function contentDepthScore(article) {
  const title = (article.title || '').length;
  const desc = (article.description || '').length;
  const content = (article.content || '').length;
  // Penalise stub articles that have almost no content beyond a title
  if (content < 50 && desc < 30) return 0;
  // Good description = 0.3, good content = 0.7
  const descScore = Math.min(desc / 150, 1) * 0.3;
  const contentScore = Math.min(content / 500, 1) * 0.7;
  return descScore + contentScore;
}

// Sources with strong topical specialization get a modest catScore bonus when
// ranking articles in their specialty category.
const CATEGORY_SOURCE_AFFINITY = {
  politics: new Set([
    'politico.com', 'politico.eu', 'thehill.com', 'axios.com',
    'foreignpolicy.com', 'foreignaffairs.com', 'euractiv.com',
  ]),
  business: new Set([
    'bloomberg.com', 'ft.com', 'economist.com', 'wsj.com',
  ]),
  technology: new Set([
    'arstechnica.com', 'wired.com', 'techcrunch.com', 'theverge.com',
  ]),
  sports: new Set(['espn.com']),
};

// Category relevance strength (0-1): how strongly an article matches a category.
// Uses the two-tier keyword system with title weighting:
//   - Strong keywords count 2x (domain-specific, high confidence)
//   - Weak keywords count 1x (shared across categories)
//   - Title matches get a bonus (keywords in the headline = high signal)
function categoryRelevanceScore(article, category) {
  if (category === 'world') return 0.5; // neutral
  const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!catKeywords) return 0.5;

  const title = (article.title || '').toLowerCase();
  const text = `${title} ${article.description || ''}`.toLowerCase();

  // Weighted hit counting
  let score = 0;

  // Strong keywords: 2 points each, +1 bonus if in title
  for (const kw of catKeywords.strong) {
    if (text.includes(kw)) {
      score += 2;
      if (title.includes(kw)) score += 1;
    }
  }

  // Weak keywords: 1 point each, +0.5 bonus if in title
  for (const kw of catKeywords.weak) {
    if (text.includes(kw)) {
      score += 1;
      if (title.includes(kw)) score += 0.5;
    }
  }

  // Source-category affinity: give a modest bonus to outlets with strong
  // topical specialization (e.g. Politico for politics, FT for business).
  if (CATEGORY_SOURCE_AFFINITY[category]?.has(getSourceDomain(article))) score += 1.5;

  // Normalise to 0-1 range. Calibrated so:
  //   1 strong hit           = 2/8  = 0.25
  //   1 strong hit in title  = 3/8  = 0.375
  //   2 strong + 2 weak      = 6/8  = 0.75
  //   3+ strong + title      = 1.0  (capped)
  return Math.min(score / 8, 1);
}

// â”€â”€ Main ranking function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// `searchTerms` (optional): when present, enables Signal 7 (keyword relevance)
// which boosts articles that strongly match the user's search query.
function rankAndDeduplicateArticles(articles, { usePopularity = false, category = null, searchTerms = null, rawKeyword = null, keywordMode = false, rangeHours = null } = {}) {
  if (articles.length === 0) return [];

  // 1. Build IDF map â€” words that appear in many titles are less distinctive
  const allTitles = articles.map(a => normaliseTitle(a.title));
  const allKeywords = allTitles.map(t => extractKeywords(t));
  const docFreq = new Map();
  for (const kws of allKeywords) {
    const unique = new Set(kws);
    for (const w of unique) docFreq.set(w, (docFreq.get(w) || 0) + 1);
  }
  const n = articles.length;
  const idfMap = new Map();
  for (const [word, freq] of docFreq) {
    // IDF: rare words get high weight, ubiquitous words get low weight
    idfMap.set(word, Math.log(n / freq) + 1);
  }

  // 2. Prepare items with pre-computed signals
  const items = articles.map((a, i) => ({
    article: a,
    keywords: allKeywords[i],
    tier: getSourceTier(a),
    timestamp: new Date(a.publishedAt).getTime() || 0,
    depth: contentDepthScore(a),
    catRelevance: categoryRelevanceScore(a, category || a.category),
    // _countryScore is set by the country relevance filter (-1 = not set, i.e. world query)
    countryRel: a._countryScore ?? -1,
    // Signal 7: keyword relevance â€” only active during keyword searches
    kwRelevance: searchTerms ? keywordRelevanceScore(a, searchTerms, rawKeyword) : -1,
    domain: getSourceDomain(a),
  }));

  // 3. Cluster by title similarity (IDF-weighted)
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [items[i]];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      const sim = titleSimilarity(items[i].keywords, items[j].keywords, idfMap);
      if (sim > 0.65) { // require strong weighted-word overlap to merge
        cluster.push(items[j]);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  // 4. Score each cluster
  const now = Date.now();
  // Scale freshness half-life to the requested date window so articles across
  // the full window are differentiated by recency (not all collapsed to ~0).
  //   24h  â†’ 4.8h  tight decay (articles stale within hours)
  //   3d   â†’ 14.4h moderate (yesterday's stories still competitive)
  //   week â†’ 33.6h broad (mid-week stories stay in the mix)
  //   monthâ†’ 120h  capped (best of the month stays visible)
  // Popularity mode without a date window keeps the existing 48h half-life.
  const FRESHNESS_RATIO = 0.20;
  const MIN_HALF_LIFE_MS = 3 * 3600_000;
  const MAX_HALF_LIFE_MS = 120 * 3600_000;
  const halfLife = (usePopularity && !rangeHours)
    ? 48 * 3600_000
    : rangeHours
      ? Math.min(Math.max(rangeHours * FRESHNESS_RATIO * 3600_000, MIN_HALF_LIFE_MS), MAX_HALF_LIFE_MS)
      : 6 * 3600_000;

  const scored = clusters.map(cluster => {
    // Pick best representative: highest tier first, then category relevance,
    // then content depth, then newest. Adding catRelevance as a tiebreaker
    // ensures the most on-topic version of a story is promoted when two articles
    // from the same tier cover the same event (e.g., both from tier-2 sources).
    cluster.sort((a, b) =>
      b.tier - a.tier ||
      b.catRelevance - a.catRelevance ||
      b.depth - a.depth ||
      b.timestamp - a.timestamp
    );
    const best = cluster[0];
    const uniqueSources = [...new Set(cluster.map(c => c.domain))];
    const coverageCount = uniqueSources.length;

    // â”€â”€ Signal 1: Source Authority (0-10) â”€â”€
    // Tier 3 = 10, Tier 2 = 7, Tier 1 = 4
    const authority = best.tier === 3 ? 10 : best.tier === 2 ? 7 : 4;

    // â”€â”€ Signal 2: Cross-Source Coverage (0-10) â”€â”€
    // Each additional unique source adds 3 points, capped at 10
    const coverage = Math.min((coverageCount - 1) * 3, 10);

    // â”€â”€ Signal 3: Freshness â€” exponential decay (0-10) â”€â”€
    // Score = 10 * 2^(-age/halfLife)
    // At t=0: 10,  at t=halfLife: 5,  at t=2*halfLife: 2.5
    const ageMs = Math.max(now - best.timestamp, 0);
    const freshness = 10 * Math.pow(2, -ageMs / halfLife);

    // â”€â”€ Signal 4: Content Depth (0-5) â”€â”€
    const depth = best.depth * 5;

    // â”€â”€ Signal 5: Category Relevance (0-8) â”€â”€
    // Blend the representative article's own category score (70%) with the cluster
    // maximum (30%). Using pure max caused a mismatch: the representative article
    // (chosen by tier/depth) could borrow a high category score from a different
    // cluster member, inflating the score of an article that doesn't match well.
    // The blend retains a small bonus for stories that have highly relevant versions
    // while anchoring to the representative's own signal.
    const repCatRelevance = best.catRelevance;
    const maxCatRelevance = Math.max(...cluster.map(c => c.catRelevance));
    const catScore = (repCatRelevance * 0.7 + maxCatRelevance * 0.3) * 8;

    // â”€â”€ Signal 6: Country Relevance (0-10) â”€â”€
    // Derived from articleCountryScore() which returns 0-10:
    //  10 = title mention + category keyword in title + multiple term hits + national source
    //   8 = title mention + multiple term hits + national source (strongest, no combined bonus)
    //   6 = title mention + frequency bonus or national source
    //   4 = title mention only (or neutral midpoint for world queries)
    //   2 = body/description mention only
    //   0 = not mentioned (passed via filler path)
    //  -1 = not set (world query â€” use neutral midpoint to avoid penalising)
    const bestCountryRel = Math.max(...cluster.map(c => c.countryRel));
    const countryRelScore = bestCountryRel === -1 ? 4 : bestCountryRel;

    // â”€â”€ Signal 7: Keyword Relevance (0-10) â”€â”€
    // Only active during keyword searches. Strongly boosts articles where
    // the search term appears in the title vs buried in the body.
    //  -1 = not a keyword search (neutral midpoint used)
    const bestKwRel = Math.max(...cluster.map(c => c.kwRelevance));
    const kwRelevanceScore = bestKwRel === -1 ? 0 : bestKwRel * 10;

    return {
      article: { ...best.article, _coverage: coverageCount > 1 ? { count: coverageCount, sources: uniqueSources } : undefined },
      signals: { authority, coverage, freshness, depth, catScore, countryRelScore, kwRelevanceScore },
      coverageCount,
      domain: best.domain,
    };
  });

  // 5. Apply time-window-dependent weights
  //
  //   Signal            | 24h (breaking)  | 3d+ (popular)
  //   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€|â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€|â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //   Freshness         |  3.0            |  1.0
  //   Authority         |  1.5            |  2.5
  //   Coverage          |  1.5            |  3.0
  //   Category Match    |  2.0            |  1.5
  //   Content Depth     |  1.0            |  1.0
  //   Country Relevance |  2.0            |  2.0   â† constant: user's country choice always matters
  //   Keyword Relevance |  2.5            |  2.5   â† only active during keyword searches
  //
  const hasKeywordSearch = searchTerms && searchTerms.length > 0;
  // In keyword monitoring mode, keyword relevance is the dominant signal (5.0),
  // freshness is reduced, and country relevance is boosted â€” this mirrors
  // professional media monitoring services like Streem and Isentia where
  // topical precision matters more than recency.
  // Weight table â€” effective max points = weight Ã— signal_max:
  //   Keyword mode: precision matters most, freshness reduced
  //   Popularity mode: cross-source coverage + authority drive the Trending feed
  //   Normal (home) mode: country + category relevance raised to compete fairly
  //     with freshness (was 3.0 freshness dominating; now 2.0 to level the field)
  const W = keywordMode
    ? { freshness: 1.0, authority: 1.5, coverage: 1.5, cat: 1.0, depth: 0.5, countryRel: 3.0, kwRel: 5.0 }
    : usePopularity
      ? { freshness: 1.0, authority: 2.5, coverage: 3.0, cat: 1.5, depth: 1.0, countryRel: 2.0, kwRel: hasKeywordSearch ? 2.5 : 0 }
      : { freshness: 2.0, authority: 1.5, coverage: 1.5, cat: 2.5, depth: 1.0, countryRel: 2.5, kwRel: hasKeywordSearch ? 2.5 : 0 };

  for (const s of scored) {
    const { authority, coverage, freshness, depth, catScore, countryRelScore, kwRelevanceScore } = s.signals;
    s.totalScore =
      authority * W.authority +
      coverage * W.coverage +
      freshness * W.freshness +
      depth * W.depth +
      catScore * W.cat +
      countryRelScore * W.countryRel +
      kwRelevanceScore * W.kwRel;
  }

  // 6. Sort by total score, then apply source diversity re-ranking
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Diversity pass: if a domain already has 2 articles in the top results,
  // apply a penalty to push later articles from the same source down.
  // This ensures varied perspectives rather than one outlet dominating.
  const domainCount = {};
  const MAX_PER_DOMAIN = 2;
  const diversified = [];

  for (const s of scored) {
    domainCount[s.domain] = (domainCount[s.domain] || 0) + 1;
    if (domainCount[s.domain] > MAX_PER_DOMAIN) {
      // Mark for demotion but don't drop entirely
      s._demoted = true;
    }
    diversified.push(s);
  }

  // Put non-demoted first, then demoted (both groups maintain their score order)
  diversified.sort((a, b) => {
    if (a._demoted !== b._demoted) return a._demoted ? 1 : -1;
    return b.totalScore - a.totalScore;
  });

  return diversified.map(s => s.article);
}

// Search-query templates for categories that use /v2/everything (more targeted than top-headlines).
// All 10 categories now have custom queries for better precision than generic top-headlines.
const EVERYTHING_QUERY_MAP = {
  politics: '(politics OR election OR parliament OR legislature OR legislation OR referendum OR "prime minister" OR chancellor OR "political party" OR "head of state" OR "executive order")',
  world: '(international OR diplomacy OR foreign OR global OR "trade deal" OR summit OR "United Nations")',
  business: '(economy OR "stock market" OR finance OR business OR GDP OR inflation OR earnings OR merger OR IPO)',
  technology: '(technology OR software OR AI OR "artificial intelligence" OR cybersecurity OR semiconductor OR startup OR "machine learning")',
  science: '(science OR research OR NASA OR climate OR discovery OR "space exploration" OR biology OR physics OR environment)',
  health: '(health OR medical OR hospital OR disease OR vaccine OR pandemic OR "public health" OR "clinical trial" OR healthcare)',
  sports: '(sports OR championship OR tournament OR Olympics OR FIFA OR "Premier League" OR athlete OR "World Cup")',
  entertainment: '(gaming OR "video game" OR esports OR film OR movie OR "box office" OR Oscar OR television OR "TV series" OR Netflix OR HBO OR music OR album OR Grammy OR concert OR "film festival")',
  gaming: '(gaming OR "video game" OR esports OR console OR PlayStation OR Xbox OR Nintendo OR "mobile game")',
  film: '(film OR movie OR cinema OR "box office" OR Oscar OR screenplay OR "film festival" OR "film review")',
  tv: '(television OR "TV series" OR "TV show" OR showrunner OR Netflix OR HBO OR Emmy OR "streaming series")',
  music: '(music OR album OR "music festival" OR Grammy OR "record label" OR concert OR "music video" OR tour)',
  trending: '(politics OR technology OR business OR science OR health OR sports OR economy OR election OR climate OR entertainment)',
};

// Helper: fetch from NewsAPI (primary - ~55 countries)
// Uses trusted source filtering: `domains` for /v2/everything, `sources` for /v2/top-headlines
// `activeDomains` and `activeSourceIds` allow per-request source overrides (user selection)
// `opts.from` and `opts.sortByPopularity` control date range and ranking strategy.
async function fetchFromNewsAPI(country, category, apiKey, activeDomains, activeSourceIds, opts = {}) {
  // opts.skipDomains: when true, don't restrict to trusted domains â€” lets NewsAPI search
  // its full index. Used for non-English-dominant countries where our trusted-domain list
  // (mostly US/UK outlets) publishes very few articles about that country per day.
  const domains = opts.skipDomains ? null : (activeDomains || TRUSTED_DOMAINS);
  const sourceIds = activeSourceIds || TRUSTED_SOURCE_IDS;
  const { from, sortByPopularity } = opts;

  // For country-specific requests, always use /v2/everything with buildNationalQuery
  // and the trusted-domains filter. This applies to ALL categories, not just those in
  // EVERYTHING_QUERY_MAP. The top-headlines endpoint cannot combine `country` with
  // `sources`, so country-specific top-headlines bypass quality filtering entirely and
  // return whatever domestic sources NewsAPI associates with that country code â€” often
  // non-English or low-quality outlets. The /v2/everything approach searches across
  // trusted domains (Reuters, SCMP, Bloomberg, FT, etc.) for paired phrases like
  // "Chinese economy" or "Chinese tech", giving far better results for all categories.
  if (country !== 'world') {
    const query = buildNationalQuery(country, category);
    const params = new URLSearchParams({
      q: query,
      sortBy: sortByPopularity ? 'popularity' : 'publishedAt',
      pageSize: '30',
      apiKey,
    });
    if (domains) params.set('domains', domains);
    if (!opts.showNonEnglish) params.set('language', 'en');
    if (from) params.set('from', from);
    const url = `https://newsapi.org/v2/everything?${params.toString()}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`NewsAPI ${category} error: ${response.status}`);
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(`NewsAPI ${category} error: ${data.message}`);
    return data.articles || [];
  }

  // World (no country filter): all categories now have EVERYTHING_QUERY_MAP entries,
  // so we always use /v2/everything with keyword queries for better precision
  // than top-headlines (which can't combine `sources` with `category`).
  const queryTemplate = EVERYTHING_QUERY_MAP[category] || category;
  const params = new URLSearchParams({
    q: queryTemplate,
    sortBy: sortByPopularity ? 'popularity' : 'publishedAt',
    pageSize: '30',
    apiKey,
  });
  if (domains) params.set('domains', domains);
  if (!opts.showNonEnglish) params.set('language', 'en');
  if (from) params.set('from', from);
  const url = `https://newsapi.org/v2/everything?${params.toString()}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`NewsAPI ${category} error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI ${category} error: ${data.message}`);
  return data.articles || [];
}

// Category-specific search terms for WorldNewsAPI â€” improves relevance over bare category names.
// Broader than EVERYTHING_QUERY_MAP (no OR/quotes syntax) since WorldNewsAPI uses simpler text matching.
const WORLD_NEWS_QUERY_TERMS = {
  technology: 'technology software AI cybersecurity startup semiconductor',
  business: 'business economy stock market finance GDP earnings',
  science: 'science research discovery NASA climate environment',
  health: 'health medical hospital disease vaccine healthcare',
  sports: 'sports championship tournament athlete league football',
  entertainment: 'entertainment film movie music gaming television concert album "video game"',
  gaming: '"video game" OR esports OR PlayStation OR Xbox OR Nintendo OR "game release" OR "game studio" OR "game developer"',
  film: '"box office" OR screenplay OR Hollywood OR Oscar OR "film festival" OR "movie review" OR "film review" OR blockbuster',
  tv: '"TV series" OR "TV show" OR Netflix OR HBO OR Emmy OR showrunner OR "streaming series" OR sitcom OR "season finale"',
  music: '"album release" OR Grammy OR "record label" OR "music festival" OR "music video" OR "world tour" OR "chart-topping"',
  politics: 'politics election parliament legislation referendum chancellor "prime minister"',
  world: 'international diplomacy foreign summit United Nations',
};

// Helper: fetch from WorldNewsAPI (secondary - broad country coverage)
async function fetchFromWorldNewsAPI(country, category, apiKey, opts = {}) {
  const topic = WORLD_NEWS_TOPIC_MAP[category] || 'politics';
  const params = new URLSearchParams({
    'number': '20',
    'sort': 'publish-time',
    'sort-direction': 'DESC',
    'api-key': apiKey,
  });
  // English-only mode: filter by language. Non-English mode: omit language filter and use
  // source-country to surface native-language outlets from the target country.
  if (!opts.showNonEnglish) {
    params.set('language', 'en');
  }
  if (opts.from) params.set('earliest-publish-date', opts.from);
  if (opts.sortByPopularity) params.set('sort', 'relevance');
  if (country !== 'world') {
    const demonym = COUNTRY_DEMONYMS[country];
    const countryName = COUNTRY_NAMES[country] || country;
    // Text query only (no source-country): finds English articles ABOUT the country
    // from any outlet. Using source-country alone restricts results to articles FROM
    // that country's own outlets, which are mostly in the local language â€” wrong for
    // English-only mode. In non-English mode we add source-country to get native sources.
    const queryTerms = WORLD_NEWS_QUERY_TERMS[category] || category;
    const textQuery = demonym
      ? `${demonym} ${queryTerms} OR ${countryName} ${queryTerms}`
      : `${countryName} ${queryTerms}`;
    params.set('text', textQuery);
    if (opts.showNonEnglish) params.set('source-country', country);
  }
  // topic filter improves precision
  if (topic) params.set('categories', topic);

  const url = `https://api.worldnewsapi.com/search-news?${params.toString()}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`WorldNewsAPI error: ${response.status}`);
  const data = await response.json();
  return data.news || [];
}

// Helper: fetch from NewsData.io (tertiary - very broad coverage)
async function fetchFromNewsData(country, category, apiKey, opts = {}) {
  const newsDataCategory = NEWS_DATA_CATEGORY_MAP[category] || 'politics';
  const params = new URLSearchParams({
    'category': newsDataCategory,
    'apikey': apiKey,
  });
  // When the native API category is a broad 'entertainment' bucket (covering gaming/film/tv/music),
  // add subcategory keyword refinement to narrow results â€” following the WorldNewsAPI pattern.
  const newsDataQuery = WORLD_NEWS_QUERY_TERMS[category];
  if (newsDataQuery && newsDataCategory !== category) {
    params.set('q', newsDataQuery);
  }
  if (!opts.showNonEnglish) params.set('language', 'en');
  if (country !== 'world') params.set('country', country);
  // NewsData.io /latest supports timeframe param (e.g. "24" for 24 hours)
  if (opts.from) params.set('from_date', opts.from);
  const url = `https://newsdata.io/api/1/latest?${params.toString()}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`NewsData error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(`NewsData error: ${data.message}`);
  return data.results || [];
}

// Helper: fetch from The Guardian (final fallback)
async function fetchFromGuardian(country, category, apiKey, opts = {}) {
  const categorySection = GUARDIAN_SECTION_MAP[category] || 'news';
  let params;
  if (country === 'world') {
    // No country restriction â€” fetch by category section only
    params = new URLSearchParams({
      section: categorySection,
      'show-fields': 'trailText,thumbnail,byline,bodyText',
      'page-size': '20',
      'order-by': 'newest',
      'api-key': apiKey || 'test',
    });
  } else {
    const countrySection = GUARDIAN_COUNTRY_SECTIONS[country];
    if (countrySection) {
      // For AU/GB/US, Guardian has dedicated country news sections.
      // Use category-specific query terms to ensure topical relevance,
      // and also search the category section with a country keyword.
      const catNouns = CATEGORY_QUERY_NOUNS[category];
      const queryTerms = catNouns ? catNouns.slice(0, 4).join(' OR ') : category;
      params = new URLSearchParams({
        q: queryTerms,
        section: `${countrySection}|${categorySection}`,
        'show-fields': 'trailText,thumbnail,byline,bodyText',
        'page-size': '20',
        'order-by': 'relevance',
        'api-key': apiKey || 'test',
      });
    } else {
      const countryName = COUNTRY_NAMES[country] || country;
      const demonym = COUNTRY_DEMONYMS[country];
      // Use CATEGORY_QUERY_NOUNS for richer queries (e.g. "German tech OR German startup
      // OR German AI") instead of the raw category name ("German technology") which is
      // too narrow and misses articles that don't use that exact term.
      const catNouns = CATEGORY_QUERY_NOUNS[category];
      const queryTerms = catNouns ? catNouns.slice(0, 5).join(' OR ') : category;
      const searchQuery = category === 'world'
        ? countryName
        : demonym
          ? `(${demonym} OR "${countryName}") AND (${queryTerms})`
          : `"${countryName}" AND (${queryTerms})`;
      params = new URLSearchParams({
        q: searchQuery,
        section: categorySection,
        'show-fields': 'trailText,thumbnail,byline,bodyText',
        'page-size': '20',
        'order-by': 'newest',
        'api-key': apiKey || 'test',
      });
    }
  }
  // Guardian supports from-date in YYYY-MM-DD format
  if (opts.from) params.set('from-date', opts.from);
  const url = `https://content.guardianapis.com/search?${params.toString()}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Guardian error: ${response.status}`);
  const data = await response.json();
  if (data.response?.status !== 'ok') throw new Error(`Guardian error: ${data.response?.message}`);
  return data.response?.results || [];
}

// Helper: fetch from GNews API (extra fallback - broad country/category coverage)
// GNews top-headlines supports both country and category simultaneously, which
// makes it a clean fit for country+category queries that exhaust other sources.
async function fetchFromGNews(country, category, apiKey, opts = {}) {
  const gnewsCategory = GNEWS_CATEGORY_MAP[category] || 'general';
  const params = new URLSearchParams({
    max: '20',
    token: apiKey,
    sortby: opts.sortByPopularity ? 'relevance' : 'publishedAt',
  });
  if (!opts.showNonEnglish) params.set('lang', 'en');
  if (opts.from) params.set('from', opts.from); // ISO 8601, e.g. 2024-01-01T00:00:00Z
  params.set('category', gnewsCategory);
  // When the native API category is a broad 'entertainment' bucket (covering gaming/film/tv/music),
  // add subcategory keyword refinement to narrow results â€” following the WorldNewsAPI pattern.
  const gnewsSubcategoryQuery = WORLD_NEWS_QUERY_TERMS[category];
  if (gnewsSubcategoryQuery && gnewsCategory !== category) {
    params.set('q', gnewsSubcategoryQuery);
  }
  if (country !== 'world') params.set('country', country);
  const url = `https://gnews.io/api/v4/top-headlines?${params}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`GNews error: ${response.status}`);
  const data = await response.json();
  if (data.errors) throw new Error(`GNews error: ${JSON.stringify(data.errors)}`);
  return data.articles || [];
}

// Categories where MediaStack has a reliable direct 1:1 mapping.
// politics and world both map to 'general' in MediaStack (too broad to trust natively).
// entertainment subcategories (gaming/film/tv/music) map to 'entertainment' â€” they are
// included here but BROAD_API_CATEGORIES in articleFilter.js ensures keyword validation
// still applies for those subcategories.
const MEDIASTACK_NATIVE_CATS = new Set([
  'business', 'technology', 'sports', 'science', 'health',
  'entertainment', 'gaming', 'film', 'tv', 'music',
]);

// Helper: fetch from MediaStack API
// Free tier: ~500 req/month (~16/day). To conserve quota, only call this when
// showNonEnglish=true and the country is not in RSS_WELL_SERVED_COUNTRIES.
// MediaStack natively supports multiple languages in one call, making it
// well-suited for non-English coverage gaps.
// Docs: https://mediastack.com/documentation
async function fetchFromMediaStack(country, category, apiKey, opts = {}) {
  const MEDIASTACK_CATEGORY_MAP = {
    business: 'business', technology: 'technology', sports: 'sports',
    science: 'science', health: 'health', entertainment: 'entertainment',
    gaming: 'entertainment', film: 'entertainment', tv: 'entertainment', music: 'entertainment',
    politics: 'general', world: 'general',
  };
  const params = new URLSearchParams({
    access_key: apiKey,
    sort: 'published_desc',
    limit: '50',
  });
  const msCategory = MEDIASTACK_CATEGORY_MAP[category] || 'general';
  params.set('categories', msCategory);
  if (country !== 'world') params.set('countries', country);
  if (opts.from) params.set('date', `${opts.from.split('T')[0]},`); // "YYYY-MM-DD," = from date onwards
  const url = `https://api.mediastack.com/v1/news?${params}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`MediaStack error: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`MediaStack error: ${JSON.stringify(data.error)}`);
  return data.data || [];
}

function formatMediaStackArticle(article, country, category, nativeCategory = false) {
  const sourceUrl = article.url || '#';
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || '',
    content: article.description || '',
    url: sourceUrl,
    image_url: article.image || null,
    source: article.source || 'MediaStack',
    publishedAt: article.published_at || new Date().toISOString(),
    time_ago: timeAgo(article.published_at),
    country, category,
    language: article.language || 'en',
    summary_points: null,
    _nativeCategory: nativeCategory,
    _meta: {
      sourceCountry: article.country || inferCountryFromUrl(sourceUrl),
    },
  };
}

// Helper: fetch from Currents API
// Free tier: 600 req/day. Supports country + language filtering.
// Positioned after NewsData.io and before Guardian as a general fallback.
// Docs: https://currentsapi.services/en/docs/
async function fetchFromCurrentsAPI(country, category, apiKey, opts = {}) {
  const CURRENTS_CATEGORY_MAP = {
    business: 'business', technology: 'technology', sports: 'sports',
    science: 'science', health: 'health', entertainment: 'entertainment',
    gaming: 'entertainment', film: 'entertainment', tv: 'entertainment', music: 'entertainment',
    politics: 'politics', world: 'world news',
  };
  const params = new URLSearchParams({
    apiKey,
    page_size: '30',
  });
  const currentsCategory = CURRENTS_CATEGORY_MAP[category];
  if (currentsCategory) params.set('category', currentsCategory);
  // When the native API category is a broad 'entertainment' bucket (covering gaming/film/tv/music),
  // add subcategory keyword refinement to narrow results â€” following the WorldNewsAPI pattern.
  const currentsQuery = WORLD_NEWS_QUERY_TERMS[category];
  if (currentsQuery && currentsCategory && currentsCategory !== category) {
    params.set('keywords', currentsQuery);
  }
  if (country !== 'world') params.set('country', country.toUpperCase());
  if (!opts.showNonEnglish) params.set('language', 'en');
  if (opts.from) params.set('start_date', opts.from);
  const url = `https://api.currentsapi.services/v1/latest-news?${params}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`CurrentsAPI error: ${response.status}`);
  const data = await response.json();
  if (data.status && data.status !== 'ok') throw new Error(`CurrentsAPI error: ${data.message || data.status}`);
  return data.news || [];
}

function formatCurrentsAPIArticle(article, country, category, nativeCategory = false) {
  const sourceUrl = article.url || '#';
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: article.title || 'No title',
    description: article.description || '',
    content: article.description || '',
    url: sourceUrl,
    image_url: article.image || null,
    source: article.author || 'Currents API',
    publishedAt: article.published || new Date().toISOString(),
    time_ago: timeAgo(article.published),
    country, category,
    language: article.language || 'en',
    summary_points: null,
    _nativeCategory: nativeCategory,
    _meta: {
      sourceCountry: inferCountryFromUrl(sourceUrl),
    },
  };
  // Map app categories to Google News RSS topics
  const GOOGLE_NEWS_CATEGORY_MAP = {
    technology: 'TECHNOLOGY',
    business: 'BUSINESS',
    science: 'SCIENCE',
    health: 'HEALTH',
    sports: 'SPORTS',
    gaming: 'ENTERTAINMENT',
    film: 'ENTERTAINMENT',
    tv: 'ENTERTAINMENT',
    politics: 'NATION',
    world: 'WORLD',
  };

  // Helper: fetch from Google News API via RSS feed
  async function fetchFromGoogleNews(country, category, opts = {}) {
    const gnCategory = GOOGLE_NEWS_CATEGORY_MAP[category] || 'WORLD';
    let url = '';

    if (country === 'world') {
      url = `https://news.google.com/rss/headlines/section/topic/${gnCategory}?hl=en-US&gl=US&ceid=US:en`;
    } else {
      // For country + category, use Google News search for better results
      const countryName = COUNTRY_NAMES[country] || country;
      const demonym = COUNTRY_DEMONYMS[country];
      const catNouns = CATEGORY_QUERY_NOUNS[category] || [category];
      const queryTerms = catNouns.slice(0, 3).join(' OR ');

      let searchQuery;
      if (demonym) {
        searchQuery = `(${demonym} OR "${countryName}") AND (${queryTerms})`;
      } else {
        searchQuery = `"${countryName}" AND (${queryTerms})`;
      }

      const encodedQ = encodeURIComponent(searchQuery);
      const gl = country.toUpperCase();
      url = `https://news.google.com/rss/search?q=${encodedQ}&hl=en-US&gl=${gl}&ceid=${gl}:en`;
    }

    // Use the RSS fetcher to get items
    const items = await fetchRSSFeed(url).catch(() => []);
    return items;
  }

  // â”€â”€ RSS support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Minimal RSS 2.0 / Atom parser â€” no external XML library needed.
  // Handles CDATA sections, HTML entities, and both RSS <link> (text node)
  // and Atom <link href="..."> (attribute) formats.

  function parseRSSFeed(xml) {
    const items = [];
    // Match <item> (RSS 2.0) or <entry> (Atom) blocks
    const blockRe = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let m;
    while ((m = blockRe.exec(xml)) !== null) {
      const block = m[1];

      // Extract text content of a named tag, unwrapping CDATA and decoding entities
      const get = (tag) => {
        const cdataM = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
        if (cdataM) return cdataM[1].trim();
        const plainM = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        if (!plainM) return null;
        return plainM[1]
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/<[^>]+>/g, '') // strip any inline HTML tags
          .trim();
      };

      // Atom feeds use <link rel="alternate" href="..."/> rather than a text node
      const getAtomLink = () => {
        const hrefM = block.match(/<link[^>]+href="([^"]+)"/i);
        return hrefM ? hrefM[1] : null;
      };

      const title = get('title');
      const link = get('link') || getAtomLink();
      // description/summary/content â€” prefer longer of description vs summary
      const desc = get('description') || '';
      const summary = get('summary') || '';
      const description = desc.length >= summary.length ? desc : summary;
      const pubDate = get('pubDate') || get('published') || get('updated') || get('dc:date');

      if (title && link) {
        items.push({ title, link, description, pubDate: pubDate || null });
      }
    }
    return items;
  }

  // RSS feed result cache â€” prevents re-fetching the same feed URL within the TTL window.
  // Most feeds update at most hourly; a 5-hour in-process cache dramatically reduces
  // redundant network calls across multiple country/category pair requests.
  // Override the TTL via RSS_CACHE_TTL_MINUTES env var (default: 300 = 5 hours).
  const RSS_CACHE = {};
  const RSS_CACHE_TTL_MS = parseInt(process.env.RSS_CACHE_TTL_MINUTES || '300', 10) * 60 * 1000;

  // Fetch an RSS/Atom feed and return parsed items.
  // Sends a browser-like User-Agent and Accept header â€” many feed servers
  // return 403 for bare fetch() calls without these.
  async function fetchRSSFeed(url) {
    // Return cached result if still within TTL
    const cached = RSS_CACHE[url];
    if (cached && (Date.now() - cached.timestamp) < RSS_CACHE_TTL_MS) {
      return cached.items;
    }

    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!response.ok) throw new Error(`RSS ${response.status}: ${url}`);
    const xml = await response.text();
    const items = parseRSSFeed(xml);

    RSS_CACHE[url] = { timestamp: Date.now(), items };
    return items;
  }

  // â”€â”€ Keyword query expansion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Maps a normalised search term to an array of related terms that are ORed
  // together in the API query. This solves cases where articles use an alternate
  // name (e.g. "UFC" instead of "MMA") that the user didn't type.
  //
  // Multi-word phrases are quoted ("mixed martial arts") so APIs treat them as
  // phrases. Single-word/acronym terms are unquoted. Both directions of an alias
  // are listed so users get consistent results regardless of which name they use.
  //
  // To add a new topic: add an entry to _EXP and map each alias to it below.

  // Shared expansion arrays â€” referenced by multiple alias keys to avoid duplication
  const _EXP = {
    MMA: ['MMA', 'UFC', 'Bellator', '"mixed martial arts"'],
    NBA: ['NBA', 'basketball', '"National Basketball Association"'],
    NFL: ['NFL', '"American football"', '"National Football League"'],
    MLB: ['MLB', 'baseball', '"Major League Baseball"'],
    NHL: ['NHL', 'hockey', '"National Hockey League"'],
    F1: ['F1', '"Formula 1"', '"Formula One"', '"Grand Prix"'],
    EPL: ['"Premier League"', 'EPL', '"English Premier League"'],
    FIFA: ['FIFA', 'football', 'soccer', '"World Cup"'],
    TENNIS: ['tennis', 'ATP', 'WTA', 'Wimbledon', '"US Open"', '"French Open"', '"Australian Open"'],
    WWE: ['WWE', '"World Wrestling Entertainment"', 'wrestling', 'AEW'],
    PGA: ['PGA', 'golf', '"PGA Tour"', '"Masters Tournament"'],
    OLYMPICS: ['Olympics', '"Olympic Games"', '"Summer Games"', '"Winter Games"'],
    CRYPTO: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain'],
    BITCOIN: ['bitcoin', 'cryptocurrency', 'crypto', 'BTC'],
    CHATGPT: ['ChatGPT', 'OpenAI', '"GPT-4"', '"large language model"'],
    EV: ['"electric vehicle"', '"electric car"', 'Tesla', 'EV'],
    NATO: ['NATO', '"North Atlantic Treaty"', '"Alliance"'],
    WHO: ['WHO', '"World Health Organization"', '"World Health Organisation"'],
    UN: ['UN', '"United Nations"', '"Security Council"', '"General Assembly"'],
  };

  const KEYWORD_EXPANSION_MAP = {
    // â”€â”€ Combat sports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'mma': _EXP.MMA,
    'ufc': _EXP.MMA,
    'bellator': _EXP.MMA,
    'mixed martial arts': _EXP.MMA,
    // â”€â”€ Basketball â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'nba': _EXP.NBA,
    'basketball': _EXP.NBA,
    // â”€â”€ American football â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'nfl': _EXP.NFL,
    // â”€â”€ Baseball â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'mlb': _EXP.MLB,
    'baseball': _EXP.MLB,
    // â”€â”€ Ice hockey â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'nhl': _EXP.NHL,
    'hockey': _EXP.NHL,
    'ice hockey': _EXP.NHL,
    // â”€â”€ Formula 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'f1': _EXP.F1,
    'formula 1': _EXP.F1,
    'formula one': _EXP.F1,
    'formula1': _EXP.F1,
    // â”€â”€ Soccer / Football â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'premier league': _EXP.EPL,
    'epl': _EXP.EPL,
    'fifa': _EXP.FIFA,
    'world cup': _EXP.FIFA,
    // â”€â”€ Tennis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'tennis': _EXP.TENNIS,
    'atp': _EXP.TENNIS,
    'wta': _EXP.TENNIS,
    'wimbledon': _EXP.TENNIS,
    // â”€â”€ Wrestling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'wwe': _EXP.WWE,
    'wrestling': _EXP.WWE,
    'aew': _EXP.WWE,
    // â”€â”€ Golf â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'pga': _EXP.PGA,
    'golf': _EXP.PGA,
    // â”€â”€ Olympics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'olympics': _EXP.OLYMPICS,
    'olympic games': _EXP.OLYMPICS,
    // â”€â”€ Crypto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'crypto': _EXP.CRYPTO,
    'cryptocurrency': _EXP.CRYPTO,
    'bitcoin': _EXP.BITCOIN,
    'btc': _EXP.BITCOIN,
    // â”€â”€ AI / Tech â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'chatgpt': _EXP.CHATGPT,
    'openai': _EXP.CHATGPT,
    // â”€â”€ Electric vehicles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'ev': _EXP.EV,
    'electric vehicle': _EXP.EV,
    'electric car': _EXP.EV,
    // â”€â”€ International organisations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    'nato': _EXP.NATO,
    'who': _EXP.WHO,
    'united nations': _EXP.UN,
  };

  // Build the actual query string to send to APIs.
  // If the keyword has a known expansion, returns an OR query covering all related terms.
  // Multi-word phrases not in the map are auto-quoted for precision (reduces noise).
  function buildSearchQuery(rawKeyword) {
    const normalized = rawKeyword.trim().toLowerCase();
    const expansions = KEYWORD_EXPANSION_MAP[normalized];
    if (expansions && expansions.length > 0) {
      return expansions.join(' OR ');
    }
    // Auto-quote multi-word phrases to avoid partial-word noise
    const kw = rawKeyword.trim();
    if (kw.includes(' ') && !kw.startsWith('"')) {
      return `"${kw}"`;
    }
    return kw;
  }

  // â”€â”€ LLM-powered dynamic query expansion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // For keywords not in the static KEYWORD_EXPANSION_MAP, use an LLM to generate
  // related search terms. This dramatically improves recall for long-tail queries
  // (e.g. "tariffs" â†’ "tariffs OR trade war OR import duties OR customs").
  // Results are cached in-memory so the same keyword only triggers one LLM call.
  const EXPANSION_CACHE = {};
  const EXPANSION_PROMPT = (keyword) =>
    `You are a search query expansion tool. Given the news search keyword "${keyword}", output 3-5 closely related search terms or synonyms that a journalist might use when writing about this topic. Output ONLY a comma-separated list of terms, nothing else. Do NOT include the original keyword. Example: for "electric cars" you might output: electric vehicles, EV, Tesla, battery vehicles, zero-emission cars`;

  // Precision-focused expansion prompt for keyword monitoring mode.
  // Generates tight, specific synonyms instead of broad ones. Avoids generic
  // terms that would match unrelated articles from other countries/sectors.
  const KEYWORD_MONITOR_EXPANSION_PROMPT = (keyword) =>
    `You are a precision search query expansion tool for a news monitoring service. Given the keyword "${keyword}", output 2-4 highly specific alternative terms or phrases that journalists would use IN THE HEADLINE when writing about this exact topic. Be precise â€” do NOT output broad or generic synonyms. Each term must be specific enough that an article using it in the headline is almost certainly about "${keyword}". Output ONLY a comma-separated list, nothing else. Do NOT include the original keyword.`;

  function parseExpansionResponse(text, originalKeyword) {
    if (!text) return null;
    const terms = text
      .split(/[,\n]/)
      .map(t => t.trim().replace(/^["']+|["']+$/g, ''))
      .filter(t => t.length > 1 && t.length < 60 && t.toLowerCase() !== originalKeyword.toLowerCase());
    if (terms.length === 0) return null;
    // Quote multi-word terms for precise API matching
    return terms.slice(0, 5).map(t => t.includes(' ') ? `"${t}"` : t);
  }

  async function expandQueryWithLLM(keyword, llmKeys, useKeywordMonitorPrompt = false) {
    const cacheKey = (useKeywordMonitorPrompt ? 'kwm:' : '') + keyword.trim().toLowerCase();
    if (EXPANSION_CACHE[cacheKey]) return EXPANSION_CACHE[cacheKey];

    // Check Supabase persistent cache before calling the LLM.
    // This survives serverless cold starts and is shared across all instances.
    const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (SB_URL && SB_KEY) {
      try {
        const sbRes = await fetch(
          `${SB_URL}/rest/v1/keyword_expansions?cache_key=eq.${encodeURIComponent(cacheKey)}&select=terms,expires_at`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        if (sbRes.ok) {
          const [row] = await sbRes.json();
          if (row && new Date(row.expires_at) > new Date()) {
            EXPANSION_CACHE[cacheKey] = row.terms;
            return row.terms;
          }
        }
      } catch { /* non-fatal â€” fall through to LLM */ }
    }

    const prompt = useKeywordMonitorPrompt
      ? KEYWORD_MONITOR_EXPANSION_PROMPT(keyword)
      : EXPANSION_PROMPT(keyword);
    // Try Gemini first (fastest/cheapest), then Groq
    const providers = [
      llmKeys.gemini && (async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${llmKeys.gemini}`;
        const res = await fetchWithTimeout(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 100 }
          })
        }, 4000); // tight 4s timeout â€” expansion shouldn't delay the search
        const data = await res.json();
        if (res.status === 429 || data.error?.code === 429) return null;
        if (!res.ok) return null;
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
      }),
      llmKeys.groq && (async () => {
        const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmKeys.groq}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3, max_tokens: 100
          })
        }, 4000);
        const data = await res.json();
        if (res.status === 429) return null;
        if (!res.ok) return null;
        return data.choices?.[0]?.message?.content;
      }),
    ].filter(Boolean);

    for (const attempt of providers) {
      try {
        const text = await attempt();
        const terms = parseExpansionResponse(text, keyword);
        if (terms) {
          EXPANSION_CACHE[cacheKey] = terms;
          // Persist to Supabase so future cold starts skip the LLM call.
          if (SB_URL && SB_KEY) {
            fetch(`${SB_URL}/rest/v1/keyword_expansions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: SB_KEY,
                Authorization: `Bearer ${SB_KEY}`,
                Prefer: 'resolution=merge-duplicates,return=minimal',
              },
              body: JSON.stringify({
                cache_key: cacheKey,
                terms,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              }),
            }).catch(() => { });
          }
          return terms;
        }
      } catch (err) {
        console.warn(`[expansion] LLM expansion failed: ${err.message}`);
      }
    }
    return null; // fallback: no expansion
  }

  // Detect user-supplied boolean operators (AND, OR, NOT in uppercase by convention).
  // When present the query is passed as-is to search APIs â€” no expansion is applied
  // since the user has already expressed their intent explicitly.
  function hasBooleanSyntax(keyword) {
    return / AND | OR | NOT /i.test(keyword);
  }

  // Build the final search query, using LLM expansion if available.
  // Called with await since LLM expansion is async.
  // opts.keywordMode: when true, uses the precision expansion prompt (fewer, tighter synonyms)
  async function buildExpandedSearchQuery(rawKeyword, llmKeys, opts = {}) {
    const normalized = rawKeyword.trim().toLowerCase();

    // 0. Boolean query: user wrote AND/OR/NOT â€” pass through without expansion
    if (hasBooleanSyntax(rawKeyword)) {
      return { query: rawKeyword.trim(), source: 'boolean' };
    }

    // 1. Check static expansion map first (instant, no LLM call needed)
    const staticExpansion = KEYWORD_EXPANSION_MAP[normalized];
    if (staticExpansion && staticExpansion.length > 0) {
      return { query: staticExpansion.join(' OR '), source: 'static' };
    }

    // 2. Try LLM-powered expansion for unknown terms
    if (llmKeys && Object.values(llmKeys).some(Boolean)) {
      const dynamicTerms = await expandQueryWithLLM(rawKeyword, llmKeys, opts.keywordMode);
      if (dynamicTerms) {
        const kw = rawKeyword.trim();
        const quotedOriginal = kw.includes(' ') ? `"${kw}"` : kw;
        // In keyword monitor mode, limit to 3 expansion terms max for precision
        const limitedTerms = opts.keywordMode ? dynamicTerms.slice(0, 3) : dynamicTerms;
        const expanded = [quotedOriginal, ...limitedTerms].join(' OR ');
        return { query: expanded, source: 'llm' };
      }
    }

    // 3. Fallback: auto-quote multi-word phrases
    const kw = rawKeyword.trim();
    if (kw.includes(' ') && !kw.startsWith('"')) {
      return { query: `"${kw}"`, source: 'quoted' };
    }
    return { query: kw, source: 'raw' };
  }

  // â”€â”€ Keyword relevance scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Simple English suffix stemmer â€” allows "running" to match "run", "runner" etc.
  // Only strips when the result is still >= 3 chars to avoid over-stemming short words.
  function stemWord(word) {
    if (word.length < 5) return word;
    const rules = [
      [/ational$/, 'ate'], [/tional$/, 'tion'], [/ations?$/, 'ate'],
      [/izing$/, 'ize'], [/ising$/, 'ise'], [/ness$/, ''],
      [/ment$/, ''], [/ings?$/, ''], [/edly$/, ''],
      [/ingly$/, ''], [/ated?$/, ''], [/iers?$/, 'y'],
      [/ies$/, 'y'], [/ers?$/, ''], [/ed$/, ''],
      [/ly$/, ''], [/es$/, ''], [/s$/, ''],
    ];
    for (const [pattern, replacement] of rules) {
      const result = word.replace(pattern, replacement);
      if (result !== word && result.length >= 3) return result;
    }
    return word;
  }

  // Scores how strongly an article matches the user's search keyword (0-1).
  // Improvements over v1:
  //   - Exact phrase bonus: multi-word keyword appearing verbatim in title/desc scores extra
  //   - Stemming: "running" matches articles about "run", "runner", etc.
  //   - Cumulative field scoring: a term found in both title and description scores higher
  //     than a title-only match, rewarding articles with deep keyword coverage
  // This becomes Signal 7 in the ranking engine for keyword searches.
  function keywordRelevanceScore(article, searchTerms, rawKeyword) {
    if (!searchTerms || searchTerms.length === 0) return 0;
    const title = (article.title || '').toLowerCase();
    const desc = (article.description || '').toLowerCase();
    const content = (article.content || '').toLowerCase();

    let score = 0;

    // Exact phrase bonus: if the original multi-word keyword appears verbatim, reward it
    // strongly â€” this is almost certainly the article the user is looking for.
    // Skip for boolean queries (they contain AND/OR/NOT which aren't literal phrases).
    if (rawKeyword) {
      const phrase = rawKeyword.trim().toLowerCase();
      if (phrase.includes(' ') && !/\b(and|or|not)\b/i.test(phrase)) {
        if (title.includes(phrase)) score += 5;
        else if (desc.includes(phrase)) score += 2.5;
      }
    }

    for (const term of searchTerms) {
      const t = term.toLowerCase().replace(/^["'(]+|["')]+$/g, '');
      if (t.length < 2) continue;
      const tStem = stemWord(t);

      const inTitle = title.includes(t) || (tStem !== t && title.includes(tStem));
      const inDesc = desc.includes(t) || (tStem !== t && desc.includes(tStem));
      const inContent = content.includes(t) || (tStem !== t && content.includes(tStem));

      // Cumulative: each field that contains the term contributes independently.
      // Title is worth most (3), desc adds signal (1), content adds a small bump (0.5).
      if (inTitle) score += 3;
      if (inDesc) score += 1;
      if (inContent) score += 0.5;
    }

    // Normalise to 0-1. Ceiling raised to 8 to accommodate phrase bonus + cumulative scoring.
    return Math.min(score / 8, 1);
  }

  // â”€â”€ Keyword search helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These search APIs directly by keyword rather than by country/category top-headlines.

  async function searchNewsAPIByKeyword(keyword, apiKey, domains, opts = {}) {
    const params = new URLSearchParams({
      q: keyword, domains: domains || TRUSTED_DOMAINS, language: 'en',
      sortBy: opts.sortByPopularity ? 'popularity' : 'publishedAt', pageSize: '50', apiKey,
    });
    if (opts.from) params.set('from', opts.from);
    const response = await fetchWithTimeout(`https://newsapi.org/v2/everything?${params}`);
    if (!response.ok) throw new Error(`NewsAPI keyword error: ${response.status}`);
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(`NewsAPI keyword error: ${data.message}`);
    return data.articles || [];
  }

  async function searchWorldNewsAPIByKeyword(keyword, apiKey, opts = {}) {
    const params = new URLSearchParams({
      text: keyword, language: 'en', number: '50',
      sort: opts.sortByPopularity ? 'relevance' : 'publish-time', 'sort-direction': 'DESC', 'api-key': apiKey,
    });
    if (opts.from) params.set('earliest-publish-date', opts.from);
    const response = await fetchWithTimeout(`https://api.worldnewsapi.com/search-news?${params}`);
    if (!response.ok) throw new Error(`WorldNewsAPI keyword error: ${response.status}`);
    const data = await response.json();
    return data.news || [];
  }

  async function searchNewsDataByKeyword(keyword, apiKey, opts = {}) {
    const params = new URLSearchParams({ q: keyword, language: 'en', size: '50', apikey: apiKey });
    if (opts.from) params.set('from_date', opts.from);
    const response = await fetchWithTimeout(`https://newsdata.io/api/1/latest?${params}`);
    if (!response.ok) throw new Error(`NewsData keyword error: ${response.status}`);
    const data = await response.json();
    if (data.status !== 'success') throw new Error(`NewsData keyword error: ${data.message}`);
    return data.results || [];
  }

  async function searchGuardianByKeyword(keyword, apiKey, opts = {}) {
    const params = new URLSearchParams({
      q: keyword, 'show-fields': 'trailText,thumbnail,byline,bodyText',
      'page-size': '50', 'order-by': 'newest', 'api-key': apiKey || 'test',
    });
    if (opts.from) params.set('from-date', opts.from);
    const response = await fetchWithTimeout(`https://content.guardianapis.com/search?${params}`);
    if (!response.ok) throw new Error(`Guardian keyword error: ${response.status}`);
    const data = await response.json();
    if (data.response?.status !== 'ok') throw new Error(`Guardian keyword error: ${data.response?.message}`);
    return data.response?.results || [];
  }

  async function searchGNewsByKeyword(keyword, apiKey, opts = {}) {
    const params = new URLSearchParams({
      q: keyword, lang: 'en', max: '10', token: apiKey,
      sortby: opts.sortByPopularity ? 'relevance' : 'publishedAt',
    });
    if (opts.from) params.set('from', opts.from);
    if (opts.country && opts.country !== 'world') params.set('country', opts.country);
    const response = await fetchWithTimeout(`https://gnews.io/api/v4/search?${params}`);
    if (!response.ok) throw new Error(`GNews keyword error: ${response.status}`);
    const data = await response.json();
    if (data.errors) throw new Error(`GNews keyword error: ${JSON.stringify(data.errors)}`);
    return data.articles || [];
  }

  async function searchGoogleNewsByKeyword(keyword, opts = {}) {
    const encodedQ = encodeURIComponent(keyword);
    const gl = opts.country && opts.country !== 'world' ? opts.country.toUpperCase() : 'US';
    const url = `https://news.google.com/rss/search?q=${encodedQ}&hl=en-US&gl=${gl}&ceid=${gl}:en`;
    const items = await fetchRSSFeed(url).catch(() => []);
    return items;
  }

  // â”€â”€ AI Summarisation â€” multi-provider fallback chain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Order: Gemini â†’ Groq â†’ OpenAI â†’ Cohere
  // Each provider throws QuotaExceededError on 429/quota so the next is tried.

  class QuotaExceededError extends Error {
    constructor(provider) {
      super(`${provider} quota exceeded`);
      this.name = 'QuotaExceededError';
    }
  }

  const SUMMARY_PROMPT = (content) =>
    `You are a factual news summarizer. Based ONLY on the provided article text, write 2-3 concise bullet points covering the key facts. Do NOT add information that is not in the text.\n\nâ€¢ Key point 1\nâ€¢ Key point 2\nâ€¢ Key point 3 (if warranted)\n\nArticle:\n${content}`;

  // Shared: prepare article text (strip truncation markers, cap length)
  function prepareArticleContent(article) {
    // Strip NewsAPI "[+XXXX chars]" truncation markers before comparing lengths so a
    // "200-char stub [+2800 chars]" doesn't incorrectly win over a full description.
    const strippedContent = (article.content || '').replace(/\s*\[\+\d+ chars\].*$/s, '').trim();
    const desc = (article.description || '').replace(/\s*\[\+\d+ chars\].*$/s, '').trim();
    const body = strippedContent.length >= desc.length ? strippedContent : desc;
    let content = body || article.title || '';
    if (article.title && !content.toLowerCase().includes(article.title.slice(0, 20).toLowerCase())) {
      content = `${article.title}. ${content}`;
    }
    return content.slice(0, 3000);
  }

  // Shared: extract bullet points from any LLM response text
  function parseBullets(text) {
    if (!text) return null;
    let bullets = text.split('\n')
      .filter(line => /^[\s]*[â€¢*\-â€“â€”]/.test(line))
      .map(line => line.replace(/^[\s]*[â€¢*\-â€“â€”]+\s*/, '').trim())
      .filter(Boolean);
    if (bullets.length === 0) {
      // Only treat lines as numbered bullets when they actually start with a digit marker
      bullets = text.split('\n')
        .filter(line => /^[\s]*\d+[.)]/.test(line))
        .map(line => line.replace(/^[\s]*\d+[.)]\s*/, '').trim())
        .filter(line => line.length > 10);
    }
    return bullets.length > 0 ? bullets.slice(0, 3) : null;
  }

  async function summarizeWithGemini(content, key) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
    const res = await fetchWithTimeout(url, {
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
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
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
    const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
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
    const res = await fetchWithTimeout('https://api.cohere.com/v2/chat', {
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

  // Per-article summary cache â€” avoids re-generating LLM summaries for the same article
  // across multiple cache refreshes. TTL of 36 hours is longer than the 12-hour news
  // cache since article content doesn't change after publication.
  const SUMMARY_CACHE = new Map();
  const SUMMARY_CACHE_TTL_MS = 36 * 60 * 60 * 1000; // 36 hours

  // Main: try each configured provider in order; skip to next on quota exhaustion
  async function generateSummary(article, llmKeys) {
    const content = prepareArticleContent(article);
    const providers = [
      llmKeys.gemini && (() => summarizeWithGemini(content, llmKeys.gemini)),
      llmKeys.groq && (() => summarizeWithGroq(content, llmKeys.groq)),
      llmKeys.openai && (() => summarizeWithOpenAI(content, llmKeys.openai)),
      llmKeys.cohere && (() => summarizeWithCohere(content, llmKeys.cohere)),
    ].filter(Boolean);

    for (const attempt of providers) {
      try {
        const result = await attempt();
        if (result) return result;
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          console.warn(`[summary] ${err.message} â€” trying next provider`);
          continue;
        }
        console.error('[summary] unexpected error:', err.message);
      }
    }
    return null;
  }

  /**
   * Cached wrapper around generateSummary. Returns a previously-generated summary
   * for the same article URL when still within SUMMARY_CACHE_TTL_MS, avoiding
   * redundant LLM calls across cache refreshes or concurrent requests.
   */
  async function generateSummaryCached(article, llmKeys) {
    const key = article.url;
    if (!key) return generateSummary(article, llmKeys);

    const cached = SUMMARY_CACHE.get(key);
    if (cached && (Date.now() - cached.timestamp) < SUMMARY_CACHE_TTL_MS) {
      return cached.points;
    }

    const points = await generateSummary(article, llmKeys);
    if (points) {
      SUMMARY_CACHE.set(key, { points, timestamp: Date.now() });
      // Evict oldest entry when cache exceeds 2000 articles
      if (SUMMARY_CACHE.size > 2000) {
        const oldest = [...SUMMARY_CACHE.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        SUMMARY_CACHE.delete(oldest[0]);
      }
    }
    return points;
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

  // â”€â”€ Source-country inference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Map common country-code TLDs to our country codes.
  // Used to infer a source's home country from its domain (e.g. smh.com.au â†’ au).
  const TLD_TO_COUNTRY = {
    au: 'au', uk: 'gb', nz: 'nz', ca: 'ca', de: 'de', fr: 'fr', jp: 'jp',
    in: 'in', br: 'br', mx: 'mx', it: 'it', es: 'es', nl: 'nl', se: 'se',
    no: 'no', pl: 'pl', ch: 'ch', be: 'be', at: 'at', ie: 'ie', pt: 'pt',
    dk: 'dk', fi: 'fi', gr: 'gr', za: 'za', ng: 'ng', eg: 'eg', ke: 'ke',
    tr: 'tr', il: 'il', ae: 'ae', sa: 'sa', ar: 'ar', cl: 'cl', co: 'co',
    id: 'id', th: 'th', my: 'my', ph: 'ph', vn: 'vn', pk: 'pk', sg: 'sg',
    hk: 'hk', tw: 'tw', cn: 'cn', kr: 'kr', ua: 'ua', ro: 'ro', hu: 'hu',
    cz: 'cz', rs: 'rs', hr: 'hr', bg: 'bg', sk: 'sk', ps: 'ps',
  };

  // International wire services and global outlets â€” these cover ALL countries
  // and should NOT give a meta-country boost to their HQ country. Articles from
  // reuters.com about India should not get +2 for UK just because Reuters is UK-based.
  const INTERNATIONAL_SOURCES = new Set([
    'reuters.com', 'apnews.com', 'bbc.co.uk', 'bbc.com',
    'aljazeera.com', 'france24.com', 'dw.com',
    'theconversation.com',
  ]);

  // Map well-known source domains to their home countries.
  // More reliable than TLD for domains like aljazeera.com (Qatar-based, English service).
  // NOTE: International sources are still mapped here (needed for non-country queries),
  // but the country scoring logic treats them differently â€” see articleCountryScore().
  const DOMAIN_TO_COUNTRY = {
    'reuters.com': 'gb', 'bbc.co.uk': 'gb', 'bbc.com': 'gb',
    'theguardian.com': 'gb', 'ft.com': 'gb', 'economist.com': 'gb',
    'nytimes.com': 'us', 'washingtonpost.com': 'us', 'cnn.com': 'us',
    'abcnews.go.com': 'us', 'cbsnews.com': 'us', 'nbcnews.com': 'us',
    'npr.org': 'us', 'pbs.org': 'us', 'politico.com': 'us',
    'wsj.com': 'us', 'bloomberg.com': 'us', 'apnews.com': 'us',
    'arstechnica.com': 'us', 'wired.com': 'us', 'techcrunch.com': 'us',
    'theverge.com': 'us', 'engadget.com': 'us', 'espn.com': 'us',
    'ign.com': 'us', 'polygon.com': 'us', 'ew.com': 'us',
    'buzzfeed.com': 'us',
    'abc.net.au': 'au', 'smh.com.au': 'au', 'theaustralian.com.au': 'au',
    'aljazeera.com': 'qa', 'france24.com': 'fr', 'dw.com': 'de',
    'scmp.com': 'hk', 'thenextweb.com': 'nl',
    'timesofindia.indiatimes.com': 'in', 'thehindu.com': 'in',
    'japantimes.co.jp': 'jp', 'straitstimes.com': 'sg',
    'theconversation.com': 'au',
    'nationalgeographic.com': 'us', 'newscientist.com': 'gb',
  };

  // Guardian section IDs that map directly to countries
  const GUARDIAN_SECTION_TO_COUNTRY = {
    'australia-news': 'au', 'uk-news': 'gb', 'us-news': 'us',
    'world': null, // global
  };

  // Infer source country from a URL's domain
  function inferCountryFromUrl(url) {
    if (!url) return null;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      // Check explicit domain map first
      if (DOMAIN_TO_COUNTRY[hostname]) return DOMAIN_TO_COUNTRY[hostname];
      // Check subdomains (e.g. news.com.au â†’ au)
      for (const [domain, country] of Object.entries(DOMAIN_TO_COUNTRY)) {
        if (hostname.endsWith('.' + domain) || hostname === domain) return country;
      }
      // Fall back to TLD
      const parts = hostname.split('.');
      const tld = parts[parts.length - 1];
      if (TLD_TO_COUNTRY[tld]) return TLD_TO_COUNTRY[tld];
      // Handle compound TLDs: .co.uk, .com.au, .co.nz, .co.jp, .com.br etc.
      // The country code is the last part; the second-to-last is the generic (.co, .com)
      if (parts.length >= 3) {
        const secondToLast = parts[parts.length - 2];
        if ((secondToLast === 'co' || secondToLast === 'com' || secondToLast === 'org' || secondToLast === 'net') && TLD_TO_COUNTRY[tld]) {
          return TLD_TO_COUNTRY[tld];
        }
      }
    } catch { }
    return null;
  }

  // Check if a source domain is an international/wire service
  function isInternationalSource(article) {
    const domain = getSourceDomain(article);
    return INTERNATIONAL_SOURCES.has(domain);
  }

  // Formatters â€” normalise each API's shape to our app format.
  // Each includes a `_meta` object with source-country inference signals
  // used by the relevance filter (stripped before sending to the client).
  function formatNewsAPIArticle(article, country, category) {
    const sourceUrl = article.url || '#';
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: article.title || 'No title',
      description: article.description || '',
      content: article.content || article.description || '',
      url: sourceUrl,
      image_url: article.urlToImage || null,
      source: article.source?.name || 'Unknown',
      publishedAt: article.publishedAt || new Date().toISOString(),
      time_ago: timeAgo(article.publishedAt),
      country, category,
      language: 'en', // NewsAPI is called with language=en (or no filter for non-English mode)
      summary_points: null,
      _meta: {
        sourceCountry: inferCountryFromUrl(sourceUrl),
      },
    };
  }

  function formatWorldNewsAPIArticle(article, country, category, nativeCategory = false) {
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
      language: article.language || 'en', // WorldNewsAPI returns language per article
      summary_points: null,
      _nativeCategory: nativeCategory,
      _meta: {
        // WorldNewsAPI provides explicit source_country â€” most reliable signal
        sourceCountry: article.source_country?.toLowerCase() || inferCountryFromUrl(article.url),
      },
    };
  }

  function formatNewsDataArticle(article, country, category, nativeCategory = false) {
    const sourceUrl = article.link || '#';
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: article.title || 'No title',
      description: article.description || article.content?.slice(0, 200) || '',
      content: article.content || article.description || '',
      url: sourceUrl,
      image_url: article.image_url || null,
      source: article.source_id || 'NewsData',
      publishedAt: article.pubDate || new Date().toISOString(),
      time_ago: timeAgo(article.pubDate),
      country, category,
      language: article.language || 'en', // NewsData.io returns language per article
      summary_points: null,
      _nativeCategory: nativeCategory,
      _meta: {
        sourceCountry: inferCountryFromUrl(sourceUrl),
      },
    };
  }

  function formatGuardianArticle(result, country, category, nativeCategory = false) {
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
      language: 'en', // Guardian only publishes in English
      summary_points: null,
      _nativeCategory: nativeCategory,
      _meta: {
        // Guardian sectionId often encodes country (e.g. 'australia-news')
        sourceCountry: GUARDIAN_SECTION_TO_COUNTRY[result.sectionId] ?? inferCountryFromUrl(result.webUrl),
        sectionId: result.sectionId || null,
      },
    };
  }

  function formatGNewsArticle(article, country, category, nativeCategory = false) {
    const sourceUrl = article.url || '#';
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: article.title || 'No title',
      description: article.description || '',
      content: article.content || article.description || '',
      url: sourceUrl,
      image_url: article.image || null,
      source: article.source?.name || 'GNews',
      publishedAt: article.publishedAt || new Date().toISOString(),
      time_ago: timeAgo(article.publishedAt),
      country, category,
      language: article.language || 'en', // GNews returns language per article
      summary_points: null,
      _nativeCategory: nativeCategory,
      _meta: {
        sourceCountry: inferCountryFromUrl(article.source?.url || sourceUrl),
      },
    };
  }

  function formatGoogleNewsArticle(item, country, category) {
    const publishedAt = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();

    // Try to extract source name from Google News title format "Title - Source"
    let source = 'Google News';
    let title = item.title;
    if (title) {
      const parts = title.split(' - ');
      if (parts.length > 1) {
        source = parts.pop();
        title = parts.join(' - ');
      }
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title || 'No title',
      description: item.description || '',
      content: item.description || '',
      url: item.link,
      image_url: null,
      source: source,
      publishedAt,
      time_ago: timeAgo(publishedAt),
      country, category,
      language: 'en',
      summary_points: null,
      _meta: {
        sourceCountry: inferCountryFromUrl(item.link),
      },
    };
  }

  function formatRSSArticle(item, feedSource, country, category) {
    const publishedAt = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: item.title,
      description: item.description || '',
      content: item.description || '',  // RSS items rarely carry full body text
      url: item.link,
      image_url: null,
      source: feedSource.name,
      publishedAt,
      time_ago: timeAgo(publishedAt),
      country, category,
      language: feedSource.language || 'en', // RSS feeds in our registry are English
      summary_points: null,
      _meta: {
        sourceCountry: inferCountryFromUrl(item.link),
      },
    };
  }

  // â”€â”€ Search analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Fire-and-forget logging to Supabase. Requires the search_analytics table:
  //
  //   CREATE TABLE search_analytics (
  //     id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  //     keyword          text        NOT NULL,
  //     user_id          text,
  //     expansion_source text,
  //     result_count     integer,
  //     is_boolean       boolean     DEFAULT false,
  //     created_at       timestamptz DEFAULT now()
  //   );
  //
  // Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) to enable.
  async function logSearchAnalytics(supabaseUrl, supabaseKey, { keyword, userId, expansionSource, resultCount, isBoolean }) {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      await fetch(`${supabaseUrl}/rest/v1/search_analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          keyword,
          user_id: userId || null,
          expansion_source: expansionSource,
          result_count: resultCount,
          is_boolean: isBoolean,
        }),
      });
    } catch (err) {
      console.warn('[analytics] Failed to log search:', err.message);
    }
  }

  // Main handler
  async function fetchNews(req, res) {
    const allowedOrigin = process.env.APP_ORIGIN || 'https://shortform.news';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // GET requests without user-specific params are publicly cacheable at the
    // Vercel Edge CDN (s-maxage=300 = 5-min fresh, stale-while-revalidate=600).
    // This means subsequent visitors with the same filters get a response from
    // the nearest edge node in ~20ms instead of hitting the serverless function.
    // We set this header early so it applies to all early-return paths below.
    const isPubliclyCacheable = req.method === 'GET'
      && !req.query.searchQuery
      && !req.query.userId
      && !req.query.mode;
    if (isPubliclyCacheable) {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    }

    // Rate limiting â€” 30 requests per IP per minute
    if (applyRateLimit(req, res)) return;

    // Validate required environment variables up front
    const { valid: envValid } = validateEnv(res, {
      required: ['NEWS_API_KEY'],
      optional: ['GUARDIAN_API_KEY', 'WORLD_NEWS_API_KEY', 'NEWS_DATA_API_KEY', 'GNEWS_API_KEY',
        'MEDIASTACK_API_KEY', 'CURRENTS_API_KEY',
        'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'COHERE_API_KEY',
        'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
    if (!envValid) return;

    const { countries, categories, searchQuery, dateRange, sources: userSources, language: langParam, userId, mode, strictMode, threshold } = req.method === 'POST' ? req.body : req.query;
    const isKeywordMode = mode === 'keyword';
    // showNonEnglish=true removes the language=en filter from all API calls, allowing
    // native-language articles to surface for non-English-dominant countries.
    const showNonEnglish = langParam === 'all' || langParam === true || langParam === 'true';

    // Build per-request domain/source-ID strings when the user has selected specific sources
    const activeDomains = (userSources && userSources.length > 0)
      ? buildTrustedDomains(userSources)
      : TRUSTED_DOMAINS;
    const activeSourceIds = (userSources && userSources.length > 0)
      ? buildTrustedSourceIds(userSources)
      : TRUSTED_SOURCE_IDS;

    // â”€â”€ Date range â†’ ISO "from" date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const dateRangeHours = { '24h': 24, '3d': 72, 'week': 168, 'month': 720 };
    const rangeHours = dateRangeHours[dateRange] || null; // null = no date restriction (e.g. 'all')
    const fromDate = rangeHours ? new Date(Date.now() - rangeHours * 60 * 60 * 1000) : null;
    const fromISO = fromDate ? fromDate.toISOString() : null; // full ISO for APIs that accept it
    const fromDateOnly = fromISO ? fromISO.split('T')[0] : null; // YYYY-MM-DD for APIs that want a date

    // For wider time windows (or no date filter), sort by popularity instead of recency.
    // This surfaces the biggest stories rather than just the latest.
    const usePopularitySort = !rangeHours || rangeHours > 24;

    const NEWS_API_KEY = process.env.VITE_NEWS_API_KEY || process.env.NEWS_API_KEY;
    const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY || null;
    const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY || null;
    const NEWS_DATA_API_KEY = process.env.NEWS_DATA_API_KEY || null;
    const GNEWS_API_KEY = process.env.GNEWS_API_KEY || null;
    const MEDIASTACK_API_KEY = process.env.MEDIASTACK_API_KEY || null;
    const CURRENTS_API_KEY = process.env.CURRENTS_API_KEY || null;
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || null;

    // LLM summarisation â€” collect all configured keys; generateSummary tries them in order
    const LLM_KEYS = {
      gemini: process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || null,
      groq: process.env.GROQ_API_KEY || null,
      openai: process.env.OPENAI_API_KEY || null,
      cohere: process.env.COHERE_API_KEY || null,
    };
    const HAS_LLM = Object.values(LLM_KEYS).some(Boolean);

    // â”€â”€ Keyword search: search APIs directly when a searchQuery is provided â”€â”€â”€â”€
    // Now country/category-aware: if the user has filters active, results are
    // tagged with the correct country/category and the ranking engine applies
    // country relevance scoring. Also uses LLM-powered query expansion,
    // keyword relevance scoring (Signal 7), result caching, and GNews.
    if (searchQuery) {
      const keyword = searchQuery.trim();
      const sourceFingerprint = getSourceFingerprint(userSources);

      // Determine country/category context from the request
      const countryList = Array.isArray(countries) && countries.length > 0 ? countries : ['world'];
      const categoryList = Array.isArray(categories) && categories.length > 0 ? categories : ['world'];
      const hasCountryFilter = countryList.some(c => c !== 'world');
      const hasCategoryFilter = categoryList.some(c => c !== 'world');

      // Check cache (keyed on keyword + filters + dateRange + sources + mode)
      const modeTag = isKeywordMode ? (strictMode ? 'kw-strict' : 'kw-monitor') : 'kw';
      const kwCacheKey = `${modeTag}-${keyword.toLowerCase()}-${countryList.sort().join(',')}-${categoryList.sort().join(',')}-${dateRange || 'all'}-${sourceFingerprint}`;
      const kwCached = await getCache(kwCacheKey);
      if (kwCached) {
        console.log(`Keyword cache HIT: "${keyword}"`);
        return res.status(200).json({ status: 'ok', articles: kwCached.articles, totalResults: kwCached.articles.length, cached: true });
      }

      // Build expanded query â€” tries static map first, then LLM, then raw
      // In keyword monitor mode, use the precision prompt for tighter synonyms
      const { query: expandedQuery, source: expansionSource } = await buildExpandedSearchQuery(keyword, LLM_KEYS, { keywordMode: isKeywordMode });
      console.log(`Keyword search${isKeywordMode ? ' [monitor]' : ''}: "${keyword}" â†’ ${expansionSource}: ${expandedQuery}`);

      // Extract search terms for keyword relevance scoring (Signal 7).
      // For boolean queries split on all operators; for OR-expanded queries split on OR only.
      const searchTerms = expandedQuery
        .split(expansionSource === 'boolean' ? / AND | OR | NOT /i : / OR /i)
        .map(t => t.trim().replace(/^["'(]+|["')]+$/g, ''))
        .filter(t => t.length > 1);

      try {
        // Fire all keyword searches in parallel across all sources
        const searchPromises = [];

        // 1. NewsAPI â€” keyword search with trusted domains
        searchPromises.push(
          searchNewsAPIByKeyword(expandedQuery, NEWS_API_KEY, activeDomains, { from: fromISO, sortByPopularity: usePopularitySort })
            .then(raw => {
              const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
              console.log(`  [1] NewsAPI keyword: ${valid.length} articles`);
              return valid.map(a => formatNewsAPIArticle(a, countryList[0], categoryList[0]));
            })
            .catch(err => { console.error('  NewsAPI keyword search failed:', err.message); return []; })
        );

        // 2. WorldNewsAPI
        if (WORLD_NEWS_API_KEY) {
          searchPromises.push(
            searchWorldNewsAPIByKeyword(expandedQuery, WORLD_NEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort })
              .then(raw => { console.log(`  [2] WorldNewsAPI keyword: ${raw.length} articles`); return raw.map(a => formatWorldNewsAPIArticle(a, countryList[0], categoryList[0])); })
              .catch(err => { console.error('  WorldNewsAPI keyword search failed:', err.message); return []; })
          );
        }

        // 3. NewsData.io
        if (NEWS_DATA_API_KEY) {
          searchPromises.push(
            searchNewsDataByKeyword(expandedQuery, NEWS_DATA_API_KEY, { from: fromDateOnly })
              .then(raw => { const valid = raw.filter(a => a.title); console.log(`  [3] NewsData keyword: ${valid.length} articles`); return valid.map(a => formatNewsDataArticle(a, countryList[0], categoryList[0])); })
              .catch(err => { console.error('  NewsData keyword search failed:', err.message); return []; })
          );
        }

        // 4. Guardian
        if (GUARDIAN_API_KEY) {
          searchPromises.push(
            searchGuardianByKeyword(expandedQuery, GUARDIAN_API_KEY, { from: fromDateOnly })
              .then(raw => { console.log(`  [4] Guardian keyword: ${raw.length} articles`); return raw.map(r => formatGuardianArticle(r, countryList[0], categoryList[0])); })
              .catch(err => { console.error('  Guardian keyword search failed:', err.message); return []; })
          );
        }

        // 5. GNews â€” now included in keyword search (supports country filtering natively)
        if (GNEWS_API_KEY) {
          searchPromises.push(
            searchGNewsByKeyword(expandedQuery, GNEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort, country: countryList[0] })
              .then(raw => { const valid = raw.filter(a => a.title); console.log(`  [5] GNews keyword: ${valid.length} articles`); return valid.map(a => formatGNewsArticle(a, countryList[0], categoryList[0])); })
              .catch(err => { console.error('  GNews keyword search failed:', err.message); return []; })
          );
        }

        // 5.5 Google News RSS â€” free, no limits, always included
        searchPromises.push(
          searchGoogleNewsByKeyword(expandedQuery, { country: countryList[0] })
            .then(raw => { const valid = raw.filter(a => a.title); console.log(`  [5.5] Google News RSS keyword: ${valid.length} articles`); return valid.map(a => formatGoogleNewsArticle(a, countryList[0], categoryList[0])); })
            .catch(err => { console.error('  Google News RSS keyword error:', err.message); return []; })
        );

        // 6. RSS feeds â€” check if any apply to the selected countries
        const rssPromises = [];
        for (const country of countryList) {
          const applicableFeeds = RSS_SOURCES.filter(f => f.url && f.countries.has(country));
          for (const feed of applicableFeeds) {
            rssPromises.push(
              fetchRSSFeed(feed.url)
                .then(items => {
                  // Filter RSS items using expanded search terms + stemming,
                  // consistent with how API sources are filtered.
                  const kwLower = keyword.toLowerCase();
                  const matched = items.filter(item => {
                    const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
                    if (text.includes(kwLower)) return true;
                    for (const term of searchTerms) {
                      const t = term.toLowerCase().replace(/^["'(]+|["')]+$/g, '');
                      if (t.length < 2) continue;
                      if (text.includes(t)) return true;
                      const stemmed = stemWord(t);
                      if (stemmed !== t && stemmed.length >= 3 && text.includes(stemmed)) return true;
                    }
                    return false;
                  });
                  return matched.map(item => formatRSSArticle(item, feed, country, categoryList[0]));
                })
                .catch(() => [])
            );
          }
        }
        if (rssPromises.length > 0) {
          searchPromises.push(
            Promise.all(rssPromises).then(results => {
              const flat = results.flat();
              if (flat.length > 0) console.log(`  [6] RSS keyword: ${flat.length} articles`);
              return flat;
            })
          );
        }

        const searchResults = await Promise.all(searchPromises);
        let results = searchResults.flat();

        // â”€â”€ Category relevance filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // When the user has specific categories selected (not just "world"),
        // boost articles matching those categories and demote off-topic ones.
        // We use a soft filter: articles matching ANY selected category are
        // kept at full weight; others are kept but scored lower by Signal 5.
        if (hasCategoryFilter) {
          const beforeCatFilter = results.length;
          // Score each article against ALL selected categories (not just the first)
          results = results.map(a => {
            const matchesAny = categoryList.some(cat => articleMatchesCategory(a, cat));
            // Tag the article's best-matching category so Signal 5 can score it
            if (matchesAny) {
              // Find which selected category matches best
              let bestCat = categoryList[0];
              let bestScore = 0;
              for (const cat of categoryList) {
                const s = categoryRelevanceScore(a, cat);
                if (s > bestScore) { bestScore = s; bestCat = cat; }
              }
              a.category = bestCat;
            }
            a._matchesCategory = matchesAny;
            return a;
          });
          // Separate matched and unmatched, but keep unmatched as filler
          // (they might still be relevant via keyword â€” the ranking engine
          // will naturally push them down via low Signal 5 scores)
          const matched = results.filter(a => a._matchesCategory);
          const unmatched = results.filter(a => !a._matchesCategory);
          results = [...matched, ...unmatched];
          if (matched.length < beforeCatFilter) {
            console.log(`  Category filter: ${matched.length}/${beforeCatFilter} match [${categoryList.join(',')}], keeping ${unmatched.length} as filler`);
          }
        }

        // â”€â”€ Country relevance scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // When user has country filters active, score each article for
        // country relevance so Signal 6 can rank them appropriately.
        // Uses articleCountryScore() which considers title mentions, body mentions,
        // term frequency, and source-country metadata (wire service aware).
        if (hasCountryFilter) {
          results = results.map(a => {
            let bestScore = 0;
            for (const country of countryList) {
              // Pass best-matching category so the combined title bonus can apply
              const bestCat = categoryList.length === 1 ? categoryList[0] : (a.category || null);
              const score = articleCountryScore(a, country, bestCat);
              bestScore = Math.max(bestScore, score);
            }
            a._countryScore = bestScore;
            return a;
          });
        }

        // Rank with keyword relevance (Signal 7), category (Signal 5), and country (Signal 6)
        const ranked = rankAndDeduplicateArticles(results, {
          usePopularity: usePopularitySort,
          category: categoryList.length === 1 ? categoryList[0] : null,
          searchTerms,
          rawKeyword: keyword,
          keywordMode: isKeywordMode,
          rangeHours,
        });

        // â”€â”€ Keyword monitoring mode: post-ranking quality filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let filtered = ranked;
        if (isKeywordMode) {
          const kwLower = keyword.toLowerCase();
          const kwTerms = searchTerms.map(t => t.toLowerCase().replace(/^["'(]+|["')]+$/g, ''));

          // Option A: Minimum relevance threshold â€” drop articles that barely
          // mention the keyword. Default 0.05; can be tuned per-keyword via the
          // `threshold` request param (clamped to [0, 1]).
          const MIN_KW_RELEVANCE = (threshold !== undefined && threshold !== null && !isNaN(parseFloat(threshold)))
            ? Math.min(Math.max(parseFloat(threshold), 0), 1)
            : 0.05;
          const beforeThreshold = filtered.length;
          filtered = filtered.filter(a => {
            const score = keywordRelevanceScore(a, searchTerms, keyword);
            return score >= MIN_KW_RELEVANCE;
          });
          if (filtered.length < beforeThreshold) {
            console.log(`  [monitor] Relevance threshold: ${filtered.length}/${beforeThreshold} articles passed (min ${MIN_KW_RELEVANCE})`);
          }

          // Option D: Strict/headline-match mode â€” only keep articles where
          // at least one search term (or the raw keyword) appears in the title.
          // This mirrors Streem/Isentia headline-focused monitoring.
          if (strictMode) {
            const beforeStrict = filtered.length;
            filtered = filtered.filter(a => {
              const title = (a.title || '').toLowerCase();
              // Check raw keyword first (exact phrase)
              if (title.includes(kwLower)) return true;
              // Then check individual search terms (including expanded synonyms)
              for (const term of kwTerms) {
                if (term.length >= 3 && title.includes(term)) return true;
                // Also try stemmed version
                const stemmed = stemWord(term);
                if (stemmed !== term && stemmed.length >= 3 && title.includes(stemmed)) return true;
              }
              return false;
            });
            if (filtered.length < beforeStrict) {
              console.log(`  [monitor] Strict headline filter: ${filtered.length}/${beforeStrict} articles have keyword in title`);
            }
          }
        }

        const clean = filtered.map(({ _meta, _coverage, _countryScore, _matchesCategory, _nativeCategory, ...rest }) => rest);

        // AI summaries for top ranked articles (up to MAX_SUMMARY_ARTICLES)
        if (HAS_LLM && clean.length > 0) {
          await Promise.all(clean.slice(0, MAX_SUMMARY_ARTICLES).map(async (article) => {
            try {
              const summary = await generateSummaryCached(article, LLM_KEYS);
              if (summary) article.summary_points = summary;
            } catch (err) {
              console.error('Summary failed:', err.message);
            }
          }));
        }

        // Cache keyword results (1-hour TTL since keyword results are more time-sensitive)
        await setCache(kwCacheKey, { timestamp: Date.now(), articles: clean });
        evictCacheIfNeeded();

        // Fire-and-forget analytics (non-blocking â€” never delays the response)
        logSearchAnalytics(SUPABASE_URL, SUPABASE_KEY, {
          keyword,
          userId: userId || null,
          expansionSource,
          resultCount: clean.length,
          isBoolean: expansionSource === 'boolean',
        });

        return res.status(200).json({ status: 'ok', articles: clean, totalResults: clean.length, cached: false });
      } catch (error) {
        console.error('Keyword search error:', error);
        return res.status(500).json({ error: 'Failed to search news' });
      }
    }

    // â”€â”€ Trending: single broad fetch across all topics, top 10 by rank â”€â”€â”€â”€â”€â”€
    // Previously made 9 separate per-category NewsAPI calls (one per trending category).
    // Now uses one call with a combined query â€” reduces API spend from 9 calls â†’ 1,
    // and uses an 8-hour TTL (3 refreshes/day) instead of the default 12 hours.
    const isTrending = Array.isArray(categories)
      ? categories.includes('trending')
      : categories === 'trending';

    if (isTrending) {
      const trendingCacheKey = getCacheKey('world', 'trending', dateRange, 'all');
      // Custom 8-hour TTL check (isCacheValid uses 12h by default)
      const trendingEntry = CACHE[trendingCacheKey];
      if (trendingEntry && (Date.now() - trendingEntry.timestamp) / 3600000 < 8) {
        console.log(`Cache HIT: ${trendingCacheKey}`);
        return res.status(200).json({ status: 'ok', articles: trendingEntry.articles, totalResults: trendingEntry.articles.length, cached: true });
      }

      try {
        console.log('Fetching trending articles â€” single broad query');

        // Currents API fallback before Guardian for trending â€” 600/day vs Guardian's 5000
        if (trendingArticles.length < 10 && CURRENTS_API_KEY) {
          console.log('  Trending Currents API fallback');
          incrementApiCounter('currents');
          const cRaw = await fetchFromCurrentsAPI('world', 'world', CURRENTS_API_KEY, {}).catch(err => { console.error('  Trending Currents failed:', err.message); return []; });
          const cExtra = cRaw.filter(a => a.title).map(a => formatCurrentsAPIArticle(a, 'world', 'trending')).filter(a => !seenUrls.has(a.url));
          for (const extra of cExtra) seenUrls.add(extra.url);
          trendingArticles = [...trendingArticles, ...cExtra];
        }

        // Guardian fallback when results are too few
        if (trendingArticles.length < 10 && GUARDIAN_API_KEY) {
          console.log('  Trending Guardian fallback');
          incrementApiCounter('guardian');
          const gRaw = await fetchFromGuardian('world', 'politics', GUARDIAN_API_KEY, {}).catch(() => []);
          const gExtra = gRaw.map(r => formatGuardianArticle(r, 'world', 'trending')).filter(a => !seenUrls.has(a.url));
          trendingArticles = [...trendingArticles, ...gExtra];
        }

        if (trendingArticles.length === 0) {
          return res.status(200).json({ status: 'ok', articles: [], totalResults: 0, cached: false });
        }

        // Rank by authority + coverage, dedup similar stories, take top 10
        const top10 = rankAndDeduplicateArticles(trendingArticles, { usePopularity: true })
          .map(({ _coverage, ...rest }) => rest)
          .slice(0, 10);

        // Generate AI summaries (with per-article cache to avoid re-generating on refresh)
        if (HAS_LLM && top10.length > 0) {
          await Promise.all(top10.slice(0, MAX_SUMMARY_ARTICLES).map(async (article) => {
            try {
              const summary = await generateSummaryCached(article, LLM_KEYS);
              if (summary) article.summary_points = summary;
            } catch (err) {
              console.error('Trending summary failed:', err.message);
            }
          }));
        }

        CACHE[trendingCacheKey] = { timestamp: Date.now(), articles: top10 };
        await setCache(trendingCacheKey, { timestamp: Date.now(), articles: top10 }, 8 * 3600);
        return res.status(200).json({ status: 'ok', articles: top10, totalResults: top10.length, cached: false });
      } catch (error) {
        console.error('Trending fetch error:', error);
        return res.status(500).json({ error: 'Failed to fetch trending news' });
      }
    }

    const countryList = Array.isArray(countries) ? countries : [countries || 'us'];
    const categoryList = Array.isArray(categories) ? categories : [categories || 'technology'];
    const sourceFingerprint = getSourceFingerprint(userSources);

    // Expand the 'all' wildcard category to every real category so that existing
    // per-pair fetching, caching, and filtering logic works without modification.
    const ALL_REAL_CATEGORIES = ['health-tech-science', 'business', 'sports', 'entertainment', 'politics'];
    const effectiveCategoryList = [...new Set(categoryList.flatMap(c => c === 'all' ? ALL_REAL_CATEGORIES : [c]))];

    try {
      // â”€â”€ Fetch all country/category pairs in PARALLEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Previously sequential: each pair waited for the previous to finish.
      // With 3 countries Ã— 3 categories = 9 pairs of up to 6 API calls each,
      // parallelization dramatically reduces total response time.
      const pairs = [];
      for (const country of countryList) {
        for (const category of effectiveCategoryList) {
          pairs.push({ country, category });
        }
      }

      const pairResults = await Promise.allSettled(
        pairs.map(({ country, category }) =>
          fetchCountryCategoryPair(country, category, {
            NEWS_API_KEY, WORLD_NEWS_API_KEY, NEWS_DATA_API_KEY, GUARDIAN_API_KEY, GNEWS_API_KEY,
            MEDIASTACK_API_KEY, CURRENTS_API_KEY,
            activeDomains, activeSourceIds, fromISO, fromDateOnly, usePopularitySort,
            rangeHours, dateRange, sourceFingerprint, showNonEnglish,
          })
        )
      );

      const allArticles = [];
      // Track country/category pairs that returned very few articles (coverage gaps)
      const lowCoverage = [];
      const LOW_COVERAGE_THRESHOLD = 3;
      for (let i = 0; i < pairResults.length; i++) {
        const result = pairResults[i];
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          const count = result.value.length;
          // Flag non-world pairs with very few articles as low-coverage
          if (count <= LOW_COVERAGE_THRESHOLD && pairs[i].country !== 'world') {
            lowCoverage.push({ country: pairs[i].country, category: pairs[i].category, count });
          }
          allArticles.push(...result.value);
        } else if (result.status === 'rejected') {
          console.error('Pair fetch failed:', result.reason?.message);
        }
      }

      // Rank ALL articles together by authority + coverage + freshness + depth + category
      const singleCategory = effectiveCategoryList.length === 1 ? effectiveCategoryList[0] : null;
      let rankedArticles = rankAndDeduplicateArticles(allArticles, { usePopularity: usePopularitySort, category: singleCategory, rangeHours });

      // Post-dedup fill-back: if deduplication reduced the count below 10, add back
      // the highest-quality dedup-losers (articles from merged clusters that weren't
      // chosen as the cluster representative) until we reach 10.
      const DISPLAY_MIN = 10;
      if (rankedArticles.length < DISPLAY_MIN && allArticles.length > rankedArticles.length) {
        const rankedUrls = new Set(rankedArticles.map(a => a.url).filter(Boolean));
        const extras = allArticles
          .filter(a => a.url && !rankedUrls.has(a.url))
          .slice(0, DISPLAY_MIN - rankedArticles.length);
        if (extras.length > 0) {
          console.log(`  Post-dedup fill: adding ${extras.length} dedup-losers to reach ${DISPLAY_MIN}`);
          rankedArticles = [...rankedArticles, ...extras];
        }
      }

      // Strip internal fields before sending to the client
      const cleanArticles = rankedArticles.map(({ _meta, _coverage, _countryScore, _matchesCategory, _nativeCategory, ...rest }) => rest);

      // â”€â”€ Enforce requested date window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // The per-pair backfill widens the time window (e.g. 24h â†’ 72h) to ensure
      // enough articles are returned. After ranking across all pairs we re-apply
      // the original date constraint so that stale articles don't appear in the
      // "Last 24 Hours" feed.
      // Threshold: for 24h queries enforce aggressively (â‰¥5 suffices); for wider
      // windows keep the original â‰¥10 floor to avoid near-empty result sets.
      let finalArticles = cleanArticles;
      if (fromDate) {
        const fromTime = fromDate.getTime();
        const inWindow = cleanArticles.filter(a => {
          if (!a.publishedAt) return true; // no date metadata â€” keep
          return new Date(a.publishedAt).getTime() >= fromTime;
        });
        const ENFORCE_MIN = rangeHours && rangeHours <= 24 ? 5 : 10;
        if (inWindow.length >= ENFORCE_MIN) {
          finalArticles = inWindow;
        } else if (inWindow.length > 0) {
          // Some in-window articles exist but below the floor â€” use them and
          // top up with the least-stale out-of-window articles to reach the floor.
          const outside = cleanArticles
            .filter(a => a.publishedAt && new Date(a.publishedAt).getTime() < fromTime)
            .slice(0, ENFORCE_MIN - inWindow.length);
          finalArticles = [...inWindow, ...outside];
        }
      }

      // AI summaries for the top final ranked articles (up to MAX_SUMMARY_ARTICLES).
      // Previously summaries were generated per-pair BEFORE ranking, wasting LLM calls
      // on articles that would later be filtered, deduplicated, or ranked below the fold.
      if (HAS_LLM && finalArticles.length > 0) {
        await Promise.all(finalArticles.slice(0, MAX_SUMMARY_ARTICLES).map(async (article) => {
          try {
            const summary = await generateSummary(article, LLM_KEYS);
            if (summary) article.summary_points = summary;
          } catch (err) {
            console.error('Summary failed:', err.message);
          }
        }));
      }

      evictCacheIfNeeded();

      return res.status(200).json({
        status: 'ok',
        articles: finalArticles,
        totalResults: finalArticles.length,
        cached: false,
        lowCoverage: lowCoverage.length > 0 ? lowCoverage : undefined,
      });

    } catch (error) {
      console.error('News fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch news' });
    }
  }

  // â”€â”€ In-flight request deduplication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // If two requests for the same country/category pair arrive simultaneously
  // (e.g. at a cache-slot boundary), only one fires the API cascade â€” the
  // second awaits the first promise instead of launching its own API calls.
  const IN_FLIGHT_REQUESTS = new Map();

  // â”€â”€ Fetch a single country/category pair â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Thin dispatcher: checks cache, deduplicates in-flight requests, delegates
  // to _doFetchPair for the actual API work.
  async function fetchCountryCategoryPair(country, category, ctx) {
    const { dateRange, sourceFingerprint, showNonEnglish } = ctx;
    const cacheKey = getCacheKey(country, category, dateRange, sourceFingerprint, showNonEnglish);

    const cachedEntry = await getCache(cacheKey);

    // If cache is valid AND no refresh is needed, return cached articles directly
    if (cachedEntry && !isRefreshNeeded(cachedEntry)) {
      console.log(`Cache HIT (fresh): ${cacheKey}`);
      return cachedEntry.articles;
    }

    // Deduplicate: return the in-flight promise if one already exists for this key
    if (IN_FLIGHT_REQUESTS.has(cacheKey)) {
      console.log(`In-flight dedup HIT: ${cacheKey}`);
      return IN_FLIGHT_REQUESTS.get(cacheKey);
    }

    const reason = cachedEntry ? 'refresh needed' : 'cache miss';
    console.log(`Cache ${reason}: ${cacheKey} â€” fetching fresh data`);
    // Pass existing cached articles so _doFetchPair can merge into them
    const existingArticles = cachedEntry ? cachedEntry.articles : [];
    const promise = _doFetchPair(cacheKey, country, category, ctx, existingArticles);
    IN_FLIGHT_REQUESTS.set(cacheKey, promise);
    promise.finally(() => IN_FLIGHT_REQUESTS.delete(cacheKey));
    return promise;
  }

  // Inner implementation â€” all API cascade logic lives here. Registered in
  // IN_FLIGHT_REQUESTS so concurrent requests for the same key share one result.
  async function _doFetchPair(cacheKey, country, category, ctx, existingArticles = []) {
    const {
      NEWS_API_KEY, WORLD_NEWS_API_KEY, NEWS_DATA_API_KEY, GUARDIAN_API_KEY, GNEWS_API_KEY,
      MEDIASTACK_API_KEY, CURRENTS_API_KEY,
      activeDomains, activeSourceIds, fromISO, fromDateOnly, usePopularitySort,
      rangeHours, dateRange, showNonEnglish,
    } = ctx;

    // For non-English-primary countries, automatically include native-language articles
    // alongside English coverage so users get local perspectives without needing a toggle.
    // English-primary countries (US/GB/AU/CA/NZ/IE) remain English-only unless the
    // caller explicitly requests all languages.
    const effectiveShowNonEnglish = !ENGLISH_PRIMARY_COUNTRIES.has(country) ? true : showNonEnglish;

    let formattedArticles = [];

    // Track which secondary sources were consulted so the post-filter retry
    // (Option A) can call only the ones that were skipped by the raw-count gate.
    const calledSources = new Set();

    // â”€â”€ Unified parallel first pass for ALL countries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // NewsAPI + WorldNewsAPI + GNews + NewsData.io fire simultaneously regardless
    // of country type for maximum article coverage and source diversity.
    // This replaces the old two-branch strategy (sequential for English-dominant
    // countries, parallel for others) â€” the sequential approach was the root cause
    // of underserved results: NewsAPI alone returning 15+ raw articles would skip
    // WorldNewsAPI and GNews entirely, and those 15 raw articles could collapse to
    // 0-3 after category+country filtering with no fallback left.
    //
    // NewsData.io is now included in the parallel pass (instead of a deferred
    // waterfall step) to bolster article volume from the start â€” it covers 100+
    // countries including many not supported by NewsAPI.
    //
    // English-dominant countries (US/GB/AU/CA/NZ/IE) keep the trusted-domain filter
    // on NewsAPI so quality is maintained; non-English-dominant countries drop it
    // (skipDomains) so NewsAPI searches its full index rather than being restricted
    // to US/UK outlets that publish very few articles about smaller countries.
    //
    // Well-covered countries (NEWSAPI_FIRST_PASS_COUNTRIES) skip WorldNewsAPI/GNews
    // in this pass to conserve their daily quotas â€” the post-filter retry below
    // will call them as a safety net if article count falls below MIN_ARTICLES.
    const guardianPriorityCountry = country === 'au' || country === 'gb' || country === 'us';
    const skipDomains = !RSS_WELL_SERVED_COUNTRIES.has(country) && country !== 'world';
    const skipSecondaryAPIs = NEWSAPI_FIRST_PASS_COUNTRIES.has(country);

    console.log(`  [1+2+3+6+7+8+GN] Parallel fetch [${country}/${category}]${skipDomains ? ' (skipDomains)' : ''}${skipSecondaryAPIs ? ' (NewsAPI-first)' : ''}${effectiveShowNonEnglish ? ' (bilingual)' : ''}`);
    // MediaStack: non-English specialist, very low quota (~16/day free).
    // Only call when showNonEnglish=true and country is not an English-primary well-served country.
    const useMediaStack = MEDIASTACK_API_KEY && effectiveShowNonEnglish && !RSS_WELL_SERVED_COUNTRIES.has(country);
    const [newsApiRaw, worldNewsRaw, gNewsRaw, newsDataRaw, currentsRaw, mediaStackRaw, googleNewsRaw] = await Promise.all([
      (country === 'world' || NEWS_API_SUPPORTED_COUNTRIES.has(country))
        ? fetchFromNewsAPI(country, category, NEWS_API_KEY, activeDomains, activeSourceIds, { from: fromISO, sortByPopularity: usePopularitySort, skipDomains, showNonEnglish: effectiveShowNonEnglish })
          .catch(err => { console.error('  NewsAPI failed:', err.message); return []; })
        : Promise.resolve([]),
      (!skipSecondaryAPIs && WORLD_NEWS_API_KEY && (country === 'world' || WORLD_NEWS_API_SUPPORTED_COUNTRIES.has(country)))
        ? fetchFromWorldNewsAPI(country, category, WORLD_NEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort, showNonEnglish: effectiveShowNonEnglish })
          .catch(err => { console.error('  WorldNewsAPI failed:', err.message); return []; })
        : Promise.resolve([]),
      (!skipSecondaryAPIs && GNEWS_API_KEY)
        ? fetchFromGNews(country, category, GNEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort, showNonEnglish: effectiveShowNonEnglish })
          .catch(err => { console.error('  GNews failed:', err.message); return []; })
        : Promise.resolve([]),
      // NewsData.io in the parallel pass â€” broadest country coverage (100+), bolsters
      // article volume especially for non-English and underserved markets.
      (NEWS_DATA_API_KEY && (country === 'world' || NEWS_DATA_SUPPORTED_COUNTRIES.has(country)))
        ? fetchFromNewsData(country, category, NEWS_DATA_API_KEY, { from: fromDateOnly, showNonEnglish: effectiveShowNonEnglish })
          .catch(err => { console.error('  NewsData failed:', err.message); return []; })
        : Promise.resolve([]),
      // Currents API â€” 600 req/day free; general fallback for additional source diversity.
      CURRENTS_API_KEY
        ? fetchFromCurrentsAPI(country, category, CURRENTS_API_KEY, { from: fromISO, showNonEnglish: effectiveShowNonEnglish })
          .catch(err => { console.error('  Currents failed:', err.message); return []; })
        : Promise.resolve([]),
      // MediaStack â€” ~16 req/day free; non-English specialist; skipped for English-primary countries.
      useMediaStack
        ? fetchFromMediaStack(country, category, MEDIASTACK_API_KEY, { from: fromISO })
          .catch(err => { console.error('  MediaStack failed:', err.message); return []; })
        : Promise.resolve([]),
      // Google News API via RSS - free, no limits, always included
      fetchFromGoogleNews(country, category, { showNonEnglish: effectiveShowNonEnglish })
        .catch(err => { console.error('  Google News failed:', err.message); return []; }),
    ]);

    calledSources.add('newsapi');
    incrementApiCounter('newsapi');
    if (!skipSecondaryAPIs && WORLD_NEWS_API_KEY && (country === 'world' || WORLD_NEWS_API_SUPPORTED_COUNTRIES.has(country))) {
      calledSources.add('worldnews');
      incrementApiCounter('worldnews');
    }
    if (!skipSecondaryAPIs && GNEWS_API_KEY) {
      calledSources.add('gnews');
      incrementApiCounter('gnews');
    }
    if (NEWS_DATA_API_KEY && (country === 'world' || NEWS_DATA_SUPPORTED_COUNTRIES.has(country))) {
      calledSources.add('newsdata');
      incrementApiCounter('newsdata');
    }
    if (CURRENTS_API_KEY) {
      calledSources.add('currents');
      incrementApiCounter('currents');
    }
    if (useMediaStack) {
      calledSources.add('mediastack');
      incrementApiCounter('mediastack');
    }

    const newsApiArticles = newsApiRaw
      .filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com')
      .map(a => formatNewsAPIArticle(a, country, category));
    const worldNewsArticles = worldNewsRaw.map(a => formatWorldNewsAPIArticle(a, country, category, true));
    const gNewsArticles = gNewsRaw.filter(a => a.title).map(a => formatGNewsArticle(a, country, category, true));
    const newsDataArticles = newsDataRaw.filter(a => a.title && a.title !== '[Removed]').map(a => formatNewsDataArticle(a, country, category, true));
    const currentsArticles = currentsRaw.filter(a => a.title && a.url).map(a => formatCurrentsAPIArticle(a, country, category, true));
    const mediaStackArticles = mediaStackRaw.filter(a => a.title && a.url).map(a => formatMediaStackArticle(a, country, category, MEDIASTACK_NATIVE_CATS.has(category)));
    const googleNewsArticles = googleNewsRaw.filter(a => a.title).map(a => formatGoogleNewsArticle(a, country, category));

    // Merge parallel results; dedup by URL so overlapping wire service articles aren't doubled
    const seenUrls = new Set();
    for (const batch of [newsApiArticles, worldNewsArticles, gNewsArticles, newsDataArticles, currentsArticles, mediaStackArticles, googleNewsArticles]) {
      for (const article of batch) {
        if (!seenUrls.has(article.url)) {
          seenUrls.add(article.url);
          formattedArticles.push(article);
        }
      }
    }

    console.log(`  Parallel result: ${newsApiArticles.length} NewsAPI + ${worldNewsArticles.length} WorldNews + ${gNewsArticles.length} GNews + ${newsDataArticles.length} NewsData + ${currentsArticles.length} Currents + ${mediaStackArticles.length} MediaStack + ${googleNewsArticles.length} Google News = ${formattedArticles.length} unique`);

    // â”€â”€ 4. Guardian (priority for AU/GB/US, fallback if < 12) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Threshold reduced from 20 â†’ 12 to limit Guardian's role as a de-facto primary
    // source. Currents API and MediaStack now fill coverage gaps first (above), so
    // Guardian is reserved for genuinely thin-coverage pairs.
    // If Guardian articles are still dominating, check whether NewsAPI/WorldNewsAPI/
    // NewsData/Currents keys are set and not exhausted.
    if (GUARDIAN_API_KEY && (guardianPriorityCountry || formattedArticles.length < 12)) {
      calledSources.add('guardian');
      incrementApiCounter('guardian');
      console.log(`  [4] Guardian [${country}/${category}] (have ${formattedArticles.length} so far)`);
      try {
        const results = await fetchFromGuardian(country, category, GUARDIAN_API_KEY, { from: fromDateOnly });
        const extra = results.map(r => formatGuardianArticle(r, country, category, true)).filter(a => !seenUrls.has(a.url));
        formattedArticles = [...formattedArticles, ...extra];
      } catch (err) {
        console.error(`  Guardian failed:`, err.message);
      }
    }

    // â”€â”€ 5. RSS feeds (Caixin, Nikkei, MercoPress, Arab News, Japan Times â€¦) â”€â”€
    {
      const applicableFeeds = RSS_SOURCES.filter(f => {
        if (!f.url || !f.countries.has(country)) return false;
        if (RSS_WELL_SERVED_COUNTRIES.has(country) && formattedArticles.length >= 25) return false;
        return true;
      });
      if (applicableFeeds.length > 0) {
        console.log(`  [5] RSS [${country}/${category}]: ${applicableFeeds.map(f => f.name).join(', ')}`);
        const rssResults = await Promise.allSettled(
          applicableFeeds.map(f => fetchRSSFeed(f.url).then(items =>
            items.map(item => formatRSSArticle(item, f, country, category))
          ))
        );
        for (const result of rssResults) {
          if (result.status === 'fulfilled') {
            formattedArticles = [...formattedArticles, ...result.value];
          } else {
            console.error(`  RSS feed failed:`, result.reason?.message);
          }
        }
      }
    }

    // â”€â”€ Relevance filter constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Defined here (before the category filter) so both the category rescue pass
    // and the country filter section can reference them.
    const MIN_ARTICLES = 15;
    const MIN_COUNTRY_SCORE = 2;
    // Below this threshold, the category rescue pass and retry/backfill use relaxed
    // rules to recover articles that would otherwise be dropped for underserved pairs.
    const LOW_COVERAGE_FLOOR = 8;

    // â”€â”€ Category relevance filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const beforeCatFilter = formattedArticles.length;
    // Snapshot pre-filter list so we can run a rescue pass below if coverage is thin.
    const preFilterArticles = formattedArticles;
    formattedArticles = formattedArticles.filter(a => {
      if (articleMatchesCategory(a, category)) return true;
      // Country-in-title bypass: allow articles that explicitly mention the country
      // in the headline, but only if they also have at least one weak category signal.
      // Previously any country-in-title article bypassed the category check entirely,
      // allowing e.g. "Brazil economy" articles to appear in a sports feed.
      if (country !== 'world' && category !== 'world') {
        const { inTitle } = articleMentionsCountry(a, country);
        if (!inTitle) return false;
        const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
        if (!catKeywords) return true; // unknown category â€” allow through
        const text = `${(a.title || '')} ${(a.description || '')}`.toLowerCase();
        return catKeywords.strong.some(kw => text.includes(kw)) ||
          catKeywords.weak.some(kw => text.includes(kw));
      }
      return false;
    });
    if (formattedArticles.length < beforeCatFilter) {
      console.log(`  Category filter: kept ${formattedArticles.length}/${beforeCatFilter} for [${category}]`);
    }

    // â”€â”€ Category rescue pass (low-coverage safety net) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // If the strict category filter left very few articles, recover articles that
    // mention the country in the headline â€” the old bypass behaviour, but only for
    // truly underserved pairs. This handles cases where domain-specific vocabulary
    // (e.g. "malaria eradication programme" for health, or local political terms)
    // doesn't match our generic keyword lists.
    if (formattedArticles.length < LOW_COVERAGE_FLOOR && country !== 'world' && category !== 'world') {
      const alreadyKept = new Set(formattedArticles.map(a => a.url).filter(Boolean));
      const rescued = preFilterArticles.filter(a => {
        if (a.url && alreadyKept.has(a.url)) return false;
        const { inTitle } = articleMentionsCountry(a, country);
        return inTitle; // country in title is enough when we're starved for coverage
      });
      if (rescued.length > 0) {
        formattedArticles = [...formattedArticles, ...rescued];
        console.log(`  Category rescue: added ${rescued.length} country-in-title articles (low-coverage pair)`);
      }
    }

    // â”€â”€ Country relevance filter (multi-signal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Uses articleCountryScore() which considers title mentions, body mentions,
    // term frequency (multiple distinct keywords), and source-country metadata
    // (with special handling for international wire services).
    // (MIN_ARTICLES, MIN_COUNTRY_SCORE, LOW_COVERAGE_FLOOR defined above)
    if (country !== 'world' && formattedArticles.length > 0) {
      const scored = formattedArticles.map(a => {
        // Pass category to enable the combined country+category title bonus
        const score = articleCountryScore(a, country, category);
        a._countryScore = score;
        return { article: a, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const relevant = scored.filter(s => s.score >= MIN_COUNTRY_SCORE);
      const marginal = scored.filter(s => s.score > 0 && s.score < MIN_COUNTRY_SCORE);
      const filler = scored.filter(s => s.score === 0);

      if (relevant.length >= MIN_ARTICLES) {
        formattedArticles = relevant.map(s => s.article);
      } else {
        // Pad with marginal (weak country mention) then true filler only as last resort.
        // Mark padding with a depressed _countryScore so ranking doesn't over-reward them.
        const needed = MIN_ARTICLES - relevant.length;
        const padding = [...marginal, ...filler].slice(0, needed);
        padding.forEach(s => { s.article._countryScore = 0.5; });
        if (padding.length > 0) {
          console.log(`  Country filter: ${relevant.length} relevant + ${padding.length} padding (marginal/filler) for [${country}]`);
        }
        formattedArticles = [...relevant, ...padding].map(s => s.article);
      }
      console.log(`  Country filter: ${relevant.length} relevant (score>=${MIN_COUNTRY_SCORE}) of ${scored.length} for [${country}]`);
    }

    // â”€â”€ Post-filter source retry (Option A) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The waterfall above stops calling secondary sources once raw article count
    // reaches 15. But for underserved countries (e.g. Brazil, Nigeria, Turkey)
    // those 15 raw articles can collapse to 2â€“5 after category+country filtering.
    // If that happens, call any sources that were skipped by the raw-count gate,
    // giving the pipeline a second chance to gather more relevant material.
    if (formattedArticles.length < MIN_ARTICLES) {
      console.log(`  Post-filter retry: only ${formattedArticles.length} relevant â€” calling skipped sources`);
      const existingUrls = new Set(formattedArticles.map(a => a.url));
      const retryPromises = [];

      if (!calledSources.has('worldnews') && WORLD_NEWS_API_KEY && (country === 'world' || WORLD_NEWS_API_SUPPORTED_COUNTRIES.has(country))) {
        retryPromises.push(
          fetchFromWorldNewsAPI(country, category, WORLD_NEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort, showNonEnglish: effectiveShowNonEnglish })
            .then(raw => raw.map(a => formatWorldNewsAPIArticle(a, country, category, true)))
            .catch(() => [])
        );
      }
      if (!calledSources.has('newsdata') && NEWS_DATA_API_KEY && (country === 'world' || NEWS_DATA_SUPPORTED_COUNTRIES.has(country))) {
        retryPromises.push(
          fetchFromNewsData(country, category, NEWS_DATA_API_KEY, { from: fromDateOnly, showNonEnglish: effectiveShowNonEnglish })
            .then(raw => raw.filter(a => a.title && a.title !== '[Removed]').map(a => formatNewsDataArticle(a, country, category, true)))
            .catch(() => [])
        );
      }
      if (!calledSources.has('guardian') && GUARDIAN_API_KEY) {
        retryPromises.push(
          fetchFromGuardian(country, category, GUARDIAN_API_KEY, { from: fromDateOnly })
            .then(r => r.map(r => formatGuardianArticle(r, country, category, true)))
            .catch(() => [])
        );
      }
      if (!calledSources.has('gnews') && GNEWS_API_KEY) {
        retryPromises.push(
          fetchFromGNews(country, category, GNEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort, showNonEnglish: effectiveShowNonEnglish })
            .then(raw => raw.filter(a => a.title).map(a => formatGNewsArticle(a, country, category, true)))
            .catch(() => [])
        );
      }

      if (retryPromises.length > 0) {
        const retryResults = await Promise.all(retryPromises);
        let retryArticles = retryResults.flat().filter(a => !existingUrls.has(a.url));

        // Apply same category + country filters to retry batch
        retryArticles = retryArticles.filter(a => {
          if (articleMatchesCategory(a, category)) return true;
          if (country !== 'world' && category !== 'world') {
            const { inTitle } = articleMentionsCountry(a, country);
            if (!inTitle) return false;
            const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
            if (!catKeywords) return true;
            const text = `${(a.title || '')} ${(a.description || '')}`.toLowerCase();
            return catKeywords.strong.some(kw => text.includes(kw)) ||
              catKeywords.weak.some(kw => text.includes(kw));
          }
          return false;
        });
        if (country !== 'world') {
          // If already well below the floor, relax to score >= 1 so that score-1
          // articles (single weak body mention) are included as last-resort coverage.
          const retryScoreThreshold = formattedArticles.length < LOW_COVERAGE_FLOOR
            ? 1
            : MIN_COUNTRY_SCORE;
          retryArticles = retryArticles.filter(a => {
            const score = articleCountryScore(a, country, category);
            a._countryScore = score;
            return score >= retryScoreThreshold;
          });
        }

        if (retryArticles.length > 0) {
          formattedArticles = [...formattedArticles, ...retryArticles];
          console.log(`  Post-filter retry: added ${retryArticles.length} articles (total now ${formattedArticles.length})`);
        }
      }
    }

    // â”€â”€ Time-window backfill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (formattedArticles.length < MIN_ARTICLES && rangeHours && rangeHours < 720) {
      // For short windows (24h, 3d) only widen by 2Ã— instead of 3Ã— to avoid
      // introducing articles that are clearly outside the requested timeframe.
      // Post-ranking date enforcement will trim any stragglers, but a tighter
      // backfill means fewer stale articles competing for the top slots.
      const backfillMultiplier = rangeHours <= 72 ? 2 : 3;
      const widerHours = Math.min(rangeHours * backfillMultiplier, 720);
      const widerFrom = new Date(Date.now() - widerHours * 60 * 60 * 1000);
      const widerFromISO = widerFrom.toISOString();
      console.log(`  Backfill: widening ${rangeHours}h â†’ ${widerHours}h (have ${formattedArticles.length}, need ${MIN_ARTICLES})`);

      try {
        const existingUrls = new Set(formattedArticles.map(a => a.url));

        // Backfill sources in parallel
        const backfillPromises = [];
        if (country === 'world' || NEWS_API_SUPPORTED_COUNTRIES.has(country)) {
          backfillPromises.push(
            fetchFromNewsAPI(country, category, NEWS_API_KEY, activeDomains, activeSourceIds, { from: widerFromISO, sortByPopularity: true })
              .then(raw => raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com').map(a => formatNewsAPIArticle(a, country, category)))
              .catch(() => [])
          );
        }
        if (GUARDIAN_API_KEY) {
          backfillPromises.push(
            fetchFromGuardian(country, category, GUARDIAN_API_KEY, { from: widerFromISO.split('T')[0] })
              .then(r => r.map(r => formatGuardianArticle(r, country, category, true)))
              .catch(() => [])
          );
        }
        if (GNEWS_API_KEY) {
          backfillPromises.push(
            fetchFromGNews(country, category, GNEWS_API_KEY, { from: widerFromISO, sortByPopularity: true })
              .then(raw => raw.filter(a => a.title).map(a => formatGNewsArticle(a, country, category, true)))
              .catch(() => [])
          );
        }

        const backfillResults = await Promise.all(backfillPromises);
        let backfill = backfillResults.flat();

        // Apply same relaxed filter to backfill
        backfill = backfill.filter(a => {
          if (articleMatchesCategory(a, category)) return true;
          if (country !== 'world' && category !== 'world') {
            const { inTitle } = articleMentionsCountry(a, country);
            if (!inTitle) return false;
            const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
            if (!catKeywords) return true;
            const text = `${(a.title || '')} ${(a.description || '')}`.toLowerCase();
            return catKeywords.strong.some(kw => text.includes(kw)) ||
              catKeywords.weak.some(kw => text.includes(kw));
          }
          return false;
        });
        backfill = backfill.filter(a => !existingUrls.has(a.url));

        if (country !== 'world') {
          // Same relaxation as the retry path: use score >= 1 when coverage is thin.
          const backfillScoreThreshold = formattedArticles.length < LOW_COVERAGE_FLOOR
            ? 1
            : MIN_COUNTRY_SCORE;
          backfill = backfill.filter(a => {
            const score = articleCountryScore(a, country, category);
            a._countryScore = score;
            return score >= backfillScoreThreshold;
          });
        }

        if (backfill.length > 0) {
          formattedArticles.push(...backfill);
          console.log(`  Backfill: added ${backfill.length} older articles`);
        }
      } catch (err) {
        console.error(`  Backfill fetch failed:`, err.message);
      }

      // â”€â”€ Second-stage backfill (last resort for very short windows) â”€â”€â”€â”€â”€â”€
      // If after the 2Ã— backfill we still have fewer than 5 articles in a
      // 24h or 3d window, widen once more to 3Ã— (e.g. 24h â†’ 72h) so that
      // genuinely underserved country+category pairs have a final safety net.
      // This does NOT fire for well-served pairs (they already have enough).
      const MIN_PAIR_RESULT = 5;
      if (formattedArticles.length < MIN_PAIR_RESULT && rangeHours && rangeHours <= 72) {
        const widerHours2 = Math.min(rangeHours * 3, 168); // cap at 7 days
        const widerFrom2 = new Date(Date.now() - widerHours2 * 60 * 60 * 1000);
        const widerFromISO2 = widerFrom2.toISOString();
        console.log(`  Backfill stage-2: widening to ${widerHours2}h (have ${formattedArticles.length})`);
        try {
          const existingUrls2 = new Set(formattedArticles.map(a => a.url));
          const backfillPromises2 = [];
          if (country === 'world' || NEWS_API_SUPPORTED_COUNTRIES.has(country)) {
            backfillPromises2.push(
              fetchFromNewsAPI(country, category, NEWS_API_KEY, activeDomains, activeSourceIds, { from: widerFromISO2, sortByPopularity: true })
                .then(raw => raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com').map(a => formatNewsAPIArticle(a, country, category)))
                .catch(() => [])
            );
          }
          if (GUARDIAN_API_KEY) {
            backfillPromises2.push(
              fetchFromGuardian(country, category, GUARDIAN_API_KEY, { from: widerFromISO2.split('T')[0] })
                .then(r => r.map(r => formatGuardianArticle(r, country, category, true)))
                .catch(() => [])
            );
          }
          if (GNEWS_API_KEY) {
            backfillPromises2.push(
              fetchFromGNews(country, category, GNEWS_API_KEY, { from: widerFromISO2, sortByPopularity: true })
                .then(raw => raw.filter(a => a.title).map(a => formatGNewsArticle(a, country, category, true)))
                .catch(() => [])
            );
          }
          const backfillResults2 = await Promise.all(backfillPromises2);
          let backfill2 = backfillResults2.flat().filter(a => !existingUrls2.has(a.url));
          // Apply category filter â€” use the country-in-title bypass since we're desperate
          backfill2 = backfill2.filter(a => {
            if (articleMatchesCategory(a, category)) return true;
            if (country !== 'world') {
              const { inTitle } = articleMentionsCountry(a, country);
              return inTitle; // old bypass: country in title is enough at this stage
            }
            return false;
          });
          // Apply minimum score >= 1 (already the relaxed threshold for low coverage)
          if (country !== 'world') {
            backfill2 = backfill2.filter(a => {
              const score = articleCountryScore(a, country, category);
              a._countryScore = score;
              return score >= 1;
            });
          }
          if (backfill2.length > 0) {
            formattedArticles.push(...backfill2);
            console.log(`  Backfill stage-2: added ${backfill2.length} articles (total ${formattedArticles.length})`);
          }
        } catch (err) {
          console.error(`  Backfill stage-2 failed:`, err.message);
        }
      }
    }

    // Strip _meta (internal inference data) before caching but KEEP _countryScore.
    // The ranking engine reads `a._countryScore ?? -1` to apply Signal 6; stripping it
    // would cause all cached articles to receive a neutral score (4) regardless of how
    // strongly they actually mention the requested country â€” making cache hits rank
    // differently from fresh fetches.
    const cleanForCache = formattedArticles.map(({ _meta, ...rest }) => rest);

    // Merge fresh articles into existing cached pool (accumulate, don't replace)
    const mergedPool = mergeArticles(existingArticles, cleanForCache);

    // When any API is near its daily quota, double the TTL to reduce further fetches.
    await setCache(cacheKey, { timestamp: Date.now(), lastFetchedAt: Date.now(), articles: mergedPool }, getEffectiveCacheTTL());
    return mergedPool;
  }
}
module.exports = {
  fetchNews,
  _doFetchPair,
  fetchCountryCategoryPair,
  clearNewsCache,
  getCacheStats,
  setRateLimits
};
