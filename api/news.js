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
  il: 'Israel', ps: 'Palestine', ae: 'UAE', sa: 'Saudi Arabia', tr: 'Turkey', qa: 'Qatar',
  kw: 'Kuwait', bh: 'Bahrain', om: 'Oman', jo: 'Jordan', lb: 'Lebanon',
  iq: 'Iraq', ir: 'Iran',
  za: 'South Africa', ng: 'Nigeria', eg: 'Egypt', ke: 'Kenya', ma: 'Morocco',
  gh: 'Ghana', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', sn: 'Senegal',
  ci: 'Ivory Coast', cm: 'Cameroon', dz: 'Algeria', tn: 'Tunisia', rw: 'Rwanda',
  au: 'Australia', nz: 'New Zealand', fj: 'Fiji', pg: 'Papua New Guinea',
};

// Trusted news sources — single registry used to derive domain and source-ID lists.
// Each entry: { domain, sourceId (NewsAPI ID, nullable), name, group }
const ALL_TRUSTED_SOURCES = [
  // ── General / Wire ────────────────────────────────────────────────────────
  { domain: 'reuters.com',        sourceId: 'reuters',              name: 'Reuters',               group: 'general' },
  { domain: 'bbc.co.uk',          sourceId: 'bbc-news',             name: 'BBC News',              group: 'general' },
  { domain: 'bbc.com',            sourceId: null,                   name: 'BBC (intl)',             group: 'general' },
  { domain: 'apnews.com',         sourceId: 'associated-press',     name: 'Associated Press',      group: 'general' },
  { domain: 'theguardian.com',    sourceId: 'the-guardian-uk',      name: 'The Guardian',          group: 'general' },
  { domain: 'abc.net.au',         sourceId: 'abc-news-au',          name: 'ABC Australia',         group: 'general' },
  { domain: 'nytimes.com',        sourceId: 'the-new-york-times',   name: 'New York Times',        group: 'general' },
  { domain: 'washingtonpost.com', sourceId: 'the-washington-post',  name: 'Washington Post',       group: 'general' },
  { domain: 'aljazeera.com',      sourceId: 'al-jazeera-english',   name: 'Al Jazeera',            group: 'general' },
  { domain: 'npr.org',            sourceId: null,                   name: 'NPR',                   group: 'general' },
  { domain: 'cnn.com',            sourceId: 'cnn',                  name: 'CNN',                   group: 'general' },
  { domain: 'abcnews.go.com',     sourceId: 'abc-news',             name: 'ABC News',              group: 'general' },
  { domain: 'cbsnews.com',        sourceId: 'cbs-news',             name: 'CBS News',              group: 'general' },
  { domain: 'nbcnews.com',        sourceId: 'nbc-news',             name: 'NBC News',              group: 'general' },
  { domain: 'pbs.org',            sourceId: null,                   name: 'PBS',                   group: 'general' },
  { domain: 'theconversation.com',sourceId: null,                   name: 'The Conversation',      group: 'general' },
  // ── Regional ──────────────────────────────────────────────────────────────
  { domain: 'smh.com.au',                    sourceId: null,                 name: 'Sydney Morning Herald',     group: 'regional' },
  { domain: 'theaustralian.com.au',           sourceId: null,                 name: 'The Australian',            group: 'regional' },
  { domain: 'france24.com',                   sourceId: null,                 name: 'France 24',                 group: 'regional' },
  { domain: 'dw.com',                         sourceId: null,                 name: 'Deutsche Welle',            group: 'regional' },
  { domain: 'scmp.com',                       sourceId: null,                 name: 'South China Morning Post',  group: 'regional' },
  { domain: 'timesofindia.indiatimes.com',    sourceId: 'the-times-of-india', name: 'Times of India',           group: 'regional' },
  { domain: 'thehindu.com',                   sourceId: 'the-hindu',          name: 'The Hindu',                group: 'regional' },
  { domain: 'japantimes.co.jp',               sourceId: null,                 name: 'Japan Times',              group: 'regional' },
  { domain: 'straitstimes.com',               sourceId: null,                 name: 'Straits Times',            group: 'regional' },
  // ── Business & Finance ────────────────────────────────────────────────────
  { domain: 'politico.com',  sourceId: 'politico',               name: 'Politico',           group: 'business' },
  { domain: 'economist.com', sourceId: null,                     name: 'The Economist',      group: 'business' },
  { domain: 'ft.com',        sourceId: null,                     name: 'Financial Times',    group: 'business' },
  { domain: 'bloomberg.com', sourceId: 'bloomberg',              name: 'Bloomberg',          group: 'business' },
  { domain: 'wsj.com',       sourceId: 'the-wall-street-journal', name: 'Wall Street Journal', group: 'business' },
  // ── Technology ────────────────────────────────────────────────────────────
  { domain: 'arstechnica.com', sourceId: 'ars-technica',  name: 'Ars Technica',  group: 'technology' },
  { domain: 'wired.com',      sourceId: 'wired',         name: 'Wired',         group: 'technology' },
  { domain: 'techcrunch.com', sourceId: 'techcrunch',     name: 'TechCrunch',    group: 'technology' },
  { domain: 'theverge.com',   sourceId: 'the-verge',     name: 'The Verge',     group: 'technology' },
  { domain: 'engadget.com',   sourceId: 'engadget',      name: 'Engadget',      group: 'technology' },
  { domain: 'thenextweb.com', sourceId: 'the-next-web',  name: 'The Next Web',  group: 'technology' },
  // ── Science ───────────────────────────────────────────────────────────────
  { domain: 'nationalgeographic.com', sourceId: 'national-geographic', name: 'National Geographic', group: 'science' },
  { domain: 'newscientist.com',       sourceId: 'new-scientist',      name: 'New Scientist',       group: 'science' },
  // ── Sports ────────────────────────────────────────────────────────────────
  { domain: 'espn.com',  sourceId: 'espn',      name: 'ESPN',      group: 'sports' },
  // ── Gaming ────────────────────────────────────────────────────────────────
  { domain: 'ign.com',     sourceId: 'ign',     name: 'IGN',     group: 'gaming' },
  { domain: 'polygon.com', sourceId: 'polygon', name: 'Polygon', group: 'gaming' },
  // ── Film & TV ─────────────────────────────────────────────────────────────
  { domain: 'ew.com',       sourceId: 'entertainment-weekly', name: 'Entertainment Weekly', group: 'film' },
  { domain: 'buzzfeed.com', sourceId: 'buzzfeed',             name: 'BuzzFeed',             group: 'tv' },
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

// Default (all sources) — used when no user selection is provided
const TRUSTED_DOMAINS = buildTrustedDomains(null);
const TRUSTED_SOURCE_IDS = buildTrustedSourceIds(null);

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
  tw: ['taiwan', 'taiwanese'],
  za: ['south africa', 'south african'],
  ng: ['nigeria', 'nigerian'],
  eg: ['egypt', 'egyptian'],
  ke: ['kenya', 'kenyan'],
  tr: ['turkey', 'turkish'],
  il: ['israel', 'israeli'],
  ps: ['palestine', 'palestinian', 'gaza', 'west bank', 'ramallah'],
  ae: ['uae', 'emirates', 'emirati'],
  sa: ['saudi', 'saudi arabia'],
  ar: ['argentina', 'argentinian'],
  cl: ['chile', 'chilean'],
  co: ['colombia', 'colombian'],
  id: ['indonesia', 'indonesian'],
  th: ['thailand', 'thai'],
  my: ['malaysia', 'malaysian'],
  ph: ['philippines', 'philippine', 'filipino'],
  vn: ['vietnam', 'vietnamese'],
  pk: ['pakistan', 'pakistani'],
};

// Demonyms used to build tighter search queries that pair the adjective with category terms.
// E.g. "Australian politics" instead of "Australia" AND "politics".
const COUNTRY_DEMONYMS = {
  us: 'American',   gb: 'British',     au: 'Australian',   ca: 'Canadian',
  de: 'German',     fr: 'French',      jp: 'Japanese',     cn: 'Chinese',
  in: 'Indian',     kr: 'South Korean', br: 'Brazilian',   mx: 'Mexican',
  it: 'Italian',    es: 'Spanish',     nl: 'Dutch',        se: 'Swedish',
  no: 'Norwegian',  pl: 'Polish',      ch: 'Swiss',        be: 'Belgian',
  at: 'Austrian',   ie: 'Irish',       pt: 'Portuguese',   dk: 'Danish',
  fi: 'Finnish',    gr: 'Greek',       nz: 'New Zealand',  sg: 'Singaporean',
  hk: 'Hong Kong',  tw: 'Taiwanese',   za: 'South African', ng: 'Nigerian',
  eg: 'Egyptian',   ke: 'Kenyan',      tr: 'Turkish',      il: 'Israeli',
  ps: 'Palestinian', ae: 'Emirati',    sa: 'Saudi',        ar: 'Argentine',    cl: 'Chilean',
  co: 'Colombian',  id: 'Indonesian',  th: 'Thai',         my: 'Malaysian',
  ph: 'Philippine',  vn: 'Vietnamese', pk: 'Pakistani',    ua: 'Ukrainian',
  ro: 'Romanian',   hu: 'Hungarian',   cz: 'Czech',        rs: 'Serbian',
  hr: 'Croatian',   bg: 'Bulgarian',   sk: 'Slovak',
};

// Short category noun phrases used to build national-relevance queries.
// Each entry produces queries like "Australian economy" or "Indian election".
const CATEGORY_QUERY_NOUNS = {
  politics:   ['politics', 'government', 'election', 'parliament', 'prime minister', 'legislation'],
  world:      ['foreign policy', 'diplomacy', 'trade deal', 'international relations'],
  business:   ['economy', 'market', 'industry', 'trade', 'central bank'],
  technology: ['tech', 'startup', 'innovation', 'digital'],
  science:    ['research', 'science', 'discovery'],
  health:     ['health', 'hospital', 'healthcare', 'medical'],
  sports:     ['sport', 'team', 'league', 'championship'],
  gaming:     ['gaming', 'video game', 'esports'],
  film:       ['film', 'movie', 'cinema'],
  tv:         ['television', 'TV', 'streaming'],
};

// Category relevance keywords — used in post-fetch filtering to verify articles
// actually match the requested topic. Broader than query nouns to allow reasonable matches.
const CATEGORY_RELEVANCE_KEYWORDS = {
  politics: [
    'politi', 'government', 'elect', 'parliament', 'legislat', 'minister',
    'president', 'senator', 'congress', 'vote', 'voter', 'ballot', 'party',
    'opposition', 'coalition', 'campaign', 'democrat', 'republican', 'labor',
    'liberal', 'conservative', 'cabinet', 'bill', 'law', 'regulation',
    'policy', 'reform', 'referendum', 'constitutional', 'bipartisan',
    'geopoliti', 'sanction', 'diplomatic', 'nato', 'tariff',
  ],
  world: [
    'international', 'diplomacy', 'diplomat', 'foreign', 'global', 'trade',
    'summit', 'united nations', ' un ', 'nato', 'treaty', 'sanction',
    'geopoliti', 'embassy', 'refugee', 'humanitarian', 'conflict',
    'bilateral', 'multilateral', 'alliance',
  ],
  business: [
    'business', 'econom', 'market', 'stock', 'financ', 'bank', 'trade',
    'invest', 'profit', 'revenue', 'gdp', 'inflation', 'interest rate',
    'startup', 'merger', 'acquisition', 'ipo', 'ceo', 'industry',
    'commodit', 'oil price', 'crypto', 'bitcoin',
  ],
  technology: [
    'tech', 'software', 'hardware', 'ai ', 'artificial intelligen',
    'startup', 'app', 'digital', 'cyber', 'robot', 'comput', 'chip',
    'semiconductor', 'cloud', 'data', 'algorithm', 'machine learning',
    'blockchain', 'quantum', 'internet', 'silicon valley',
  ],
  science: [
    'scien', 'research', 'study', 'discover', 'experiment', 'nasa',
    'space', 'climate', 'species', 'fossil', 'dna', 'genome', 'physics',
    'chemist', 'biolog', 'astrono', 'geolog', 'environ', 'carbon',
  ],
  health: [
    'health', 'medical', 'hospital', 'doctor', 'patient', 'disease',
    'virus', 'vaccine', 'treatment', 'drug', 'pharma', 'surgery',
    'mental health', 'cancer', 'diabet', 'obesity', 'pandemic',
    'clinic', 'diagnosis', 'symptom', 'therapy', 'who ',
  ],
  sports: [
    'sport', 'game', 'match', 'team', 'player', 'coach', 'league',
    'championship', 'tournament', 'goal', 'score', 'win', 'defeat',
    'season', 'final', 'olympic', 'fifa', 'nba', 'nfl', 'cricket',
    'football', 'soccer', 'tennis', 'rugby', 'athlet',
  ],
  gaming: [
    'gaming', 'video game', 'esport', 'console', 'playstation', 'xbox',
    'nintendo', 'steam', 'gamer', 'fps', 'rpg', 'multiplayer',
    'twitch', 'game developer', 'gameplay',
  ],
  film: [
    'film', 'movie', 'cinema', 'box office', 'director', 'actor',
    'actress', 'oscar', 'screenplay', 'hollywood', 'blockbuster',
    'premiere', 'sequel', 'franchise', 'animation', 'documentary',
  ],
  tv: [
    'television', 'tv show', 'tv series', 'streaming', 'showrunner',
    'netflix', 'hbo', 'disney+', 'series finale', 'episode',
    'renewal', 'cancell', 'sitcom', 'drama series',
  ],
};

// Check if an article's title+description match the requested category.
// Returns true if at least one category keyword appears.
function articleMatchesCategory(article, category) {
  // 'world' is too broad to filter usefully — we rely on query-level filtering
  if (category === 'world') return true;
  const keywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!keywords) return true; // unknown category, don't filter
  const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return keywords.some(kw => text.includes(kw));
}

function getCountryTerms(country) {
  if (COUNTRY_RELEVANCE_KEYWORDS[country]) return COUNTRY_RELEVANCE_KEYWORDS[country];
  const name = COUNTRY_NAMES[country];
  return name ? [name.toLowerCase()] : [country.toLowerCase()];
}

// Check if country is mentioned in the article title (strict) or title+description (loose)
function articleMentionsCountry(article, country) {
  const terms = getCountryTerms(country);
  const title = (article.title || '').toLowerCase();
  const text = `${title} ${article.description || ''}`.toLowerCase();
  return {
    inTitle: terms.some(term => title.includes(term)),
    inText:  terms.some(term => text.includes(term)),
  };
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
  const topicKeywords = nouns.slice(0, 3).join(' OR ');
  const looseTerm = demonym
    ? `(${demonym} OR ${countryName}) AND (${topicKeywords})`
    : `${countryName} AND (${topicKeywords})`;

  return `(${phrases.join(' OR ')} OR ${looseTerm})`;
}

// Map app categories to Guardian API sections
const GUARDIAN_SECTION_MAP = {
  technology:    'technology',
  business:      'business',
  science:       'science',
  health:        'society',
  sports:        'sport',
  gaming:        'games',
  film:          'film',
  tv:            'tv-and-radio',
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
  gaming:        'entertainment',
  film:          'entertainment',
  tv:            'entertainment',
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
  gaming:        'entertainment',
  film:          'entertainment',
  tv:            'entertainment',
  politics:      'politics',
  world:         'world'
};

// Helper: generate cache key (slot = "am" or "pm" to refresh twice a day)
function getCacheKey(country, category, dateRange) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const slot = now.getUTCHours() < 12 ? 'am' : 'pm';
  return `${date}-${slot}-${country}-${category}-${dateRange || '24h'}`;
}

// Helper: check if cache is still valid
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const ageInHours = (Date.now() - cacheEntry.timestamp) / (1000 * 60 * 60);
  return ageInHours < CACHE_TTL_HOURS;
}

// ── Source authority tiers ────────────────────────────────────────────────
// Higher-tier sources are weighted more heavily in ranking.
// Tier 3 (+3): Major wire services / international quality broadsheets
// Tier 2 (+2): Strong national outlets & specialist publications
// Tier 1 (+1): Reputable but narrower outlets (default for any trusted source)
const SOURCE_AUTHORITY_TIER = {
  // Tier 3 — wire services & top international
  'reuters.com': 3, 'apnews.com': 3, 'bbc.co.uk': 3, 'bbc.com': 3,
  'nytimes.com': 3, 'theguardian.com': 3, 'washingtonpost.com': 3,
  'economist.com': 3, 'ft.com': 3, 'bloomberg.com': 3,
  // Tier 2 — strong nationals & specialists
  'cnn.com': 2, 'npr.org': 2, 'abc.net.au': 2, 'aljazeera.com': 2,
  'wsj.com': 2, 'politico.com': 2, 'abcnews.go.com': 2, 'cbsnews.com': 2,
  'nbcnews.com': 2, 'pbs.org': 2, 'france24.com': 2, 'dw.com': 2,
  'arstechnica.com': 2, 'wired.com': 2, 'techcrunch.com': 2, 'theverge.com': 2,
  'espn.com': 2, 'scmp.com': 2, 'theconversation.com': 2,
  'timesofindia.indiatimes.com': 2, 'thehindu.com': 2,
};

// Normalise a source name or URL to a domain key for tier lookup
function getSourceDomain(article) {
  try {
    if (article.url) return new URL(article.url).hostname.replace(/^www\./, '');
  } catch {}
  return '';
}

function getSourceTier(article) {
  const domain = getSourceDomain(article);
  return SOURCE_AUTHORITY_TIER[domain] || 1; // default tier 1 for known trusted sources
}

// ── Cross-source story clustering & importance ranking ───────────────────
// Detects the same story covered by multiple outlets by comparing normalised
// title prefixes.  Stories covered by more sources get a coverage bonus.
// Combined score = authority + coverage + recency, producing a ranking that
// surfaces the most important/popular stories.

function normaliseTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[''"""\-–—:,.|!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Simple word-overlap similarity (Jaccard-like)
function titleSimilarity(a, b) {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 3));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

// Cluster articles about the same story, pick the best representative from
// each cluster, and rank by combined score.
function rankAndDeduplicateArticles(articles, { usePopularity = false } = {}) {
  if (articles.length === 0) return [];

  // 1. Normalise titles
  const items = articles.map(a => ({
    article: a,
    normTitle: normaliseTitle(a.title),
    tier: getSourceTier(a),
    timestamp: new Date(a.publishedAt).getTime() || 0,
  }));

  // 2. Cluster by title similarity (greedy single-pass)
  const clusters = [];      // array of { articles: [...items], coverageCount }
  const assigned = new Set();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [items[i]];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (titleSimilarity(items[i].normTitle, items[j].normTitle) > 0.5) {
        cluster.push(items[j]);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  // 3. From each cluster, pick the best representative and compute a combined score.
  const ranked = clusters.map(cluster => {
    // Sort within cluster: highest tier first, then newest
    cluster.sort((a, b) => b.tier - a.tier || b.timestamp - a.timestamp);
    const best = cluster[0];
    const coverageCount = cluster.length;
    const sources = [...new Set(cluster.map(c => getSourceDomain(c.article)))];

    // Combined score:
    //   authority:  tier value (1-3)
    //   coverage:   2 points per additional source covering the story
    //   recency:    normalised 0-3 based on how recent (most recent article gets 3)
    const authorityScore = best.tier;
    const coverageScore = Math.min((coverageCount - 1) * 2, 6); // cap at 6

    return {
      article: { ...best.article, _coverage: coverageCount > 1 ? { count: coverageCount, sources } : undefined },
      authority: authorityScore,
      coverage: coverageScore,
      timestamp: best.timestamp,
    };
  });

  // 4. Normalise recency across all clusters
  const now = Date.now();
  const oldest = Math.min(...ranked.map(r => r.timestamp));
  const range = now - oldest || 1;

  for (const r of ranked) {
    r.recency = ((r.timestamp - oldest) / range) * 3; // 0-3 scale
  }

  // 5. Final sort: when usePopularity, weight authority+coverage more; otherwise emphasise recency
  ranked.sort((a, b) => {
    const scoreA = usePopularity
      ? (a.authority * 2 + a.coverage * 2 + a.recency)
      : (a.authority + a.coverage + a.recency * 3);
    const scoreB = usePopularity
      ? (b.authority * 2 + b.coverage * 2 + b.recency)
      : (b.authority + b.coverage + b.recency * 3);
    return scoreB - scoreA;
  });

  return ranked.map(r => r.article);
}

// Search-query templates for categories that use /v2/everything (more targeted than top-headlines)
const EVERYTHING_QUERY_MAP = {
  politics: '(politics OR government OR election OR parliament OR president OR minister OR policy OR legislation)',
  world:    '(international OR diplomacy OR foreign OR global OR trade OR summit OR UN)',
  gaming:   '(gaming OR "video game" OR esports OR console OR PlayStation OR Xbox OR Nintendo)',
  film:     '(film OR movie OR cinema OR "box office" OR director OR screenplay)',
  tv:       '(television OR "TV series" OR streaming OR "TV show" OR showrunner OR Netflix OR HBO)',
};

// Helper: fetch from NewsAPI (primary - ~55 countries)
// Uses trusted source filtering: `domains` for /v2/everything, `sources` for /v2/top-headlines
// `activeDomains` and `activeSourceIds` allow per-request source overrides (user selection)
// `opts.from` and `opts.sortByPopularity` control date range and ranking strategy.
async function fetchFromNewsAPI(country, category, apiKey, activeDomains, activeSourceIds, opts = {}) {
  const domains = activeDomains || TRUSTED_DOMAINS;
  const sourceIds = activeSourceIds || TRUSTED_SOURCE_IDS;
  const { from, sortByPopularity } = opts;

  // Categories that need /v2/everything for precise targeting
  if (EVERYTHING_QUERY_MAP[category]) {
    // For country-specific queries, use tightly paired phrases ("Australian politics")
    // instead of loose AND ("Australia" AND "politics") to ensure national relevance.
    const query = country !== 'world'
      ? buildNationalQuery(country, category)
      : EVERYTHING_QUERY_MAP[category];
    const params = new URLSearchParams({
      q: query,
      domains,
      language: 'en',
      sortBy: sortByPopularity ? 'popularity' : 'publishedAt',
      pageSize: '30',
      apiKey,
    });
    if (from) params.set('from', from);
    const url = `https://newsapi.org/v2/everything?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NewsAPI ${category} error: ${response.status}`);
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(`NewsAPI ${category} error: ${data.message}`);
    return data.articles || [];
  }

  // For standard categories (technology, business, science, health, sports),
  // use top-headlines. Note: NewsAPI top-headlines doesn't allow both `sources` and `country`,
  // so when filtering by country we can't also filter by sources.
  const categoryMap = {
    technology: 'technology', business: 'business', science: 'science',
    health: 'health', sports: 'sports',
  };
  const newsApiCategory = categoryMap[category] || 'general';

  let url;
  if (country === 'world') {
    // No country restriction — use sources filter for quality
    url = `https://newsapi.org/v2/top-headlines?sources=${sourceIds}&pageSize=20&apiKey=${apiKey}`;
  } else {
    // Country-specific: can't combine with sources param, so just use country+category
    url = `https://newsapi.org/v2/top-headlines?country=${country}&category=${newsApiCategory}&pageSize=20&apiKey=${apiKey}`;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NewsAPI error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI error: ${data.message}`);
  return data.articles || [];
}

// Category-specific search terms for WorldNewsAPI — improves relevance over bare category names
const WORLD_NEWS_QUERY_TERMS = {
  technology: 'technology software AI computing',
  business:   'business economy market finance',
  science:    'science research discovery study',
  health:     'health medical hospital disease treatment',
  sports:     'sports match championship tournament',
  gaming:     'gaming video game esports console',
  film:       'film movie cinema box office',
  tv:         'television TV series streaming show',
  politics:   'politics government election parliament',
  world:      'international diplomacy foreign global',
};

// Helper: fetch from WorldNewsAPI (secondary - broad country coverage)
async function fetchFromWorldNewsAPI(country, category, apiKey, opts = {}) {
  const topic = WORLD_NEWS_TOPIC_MAP[category] || 'politics';
  const params = new URLSearchParams({
    'language': 'en',
    'number': '20',
    'sort': 'publish-time',
    'sort-direction': 'DESC',
    'api-key': apiKey,
  });
  if (opts.from) params.set('earliest-publish-date', opts.from);
  if (opts.sortByPopularity) params.set('sort', 'relevance');
  if (country !== 'world') {
    const demonym = COUNTRY_DEMONYMS[country];
    const countryName = COUNTRY_NAMES[country] || country;
    params.set('source-country', country);
    // Use demonym + category terms for national relevance (e.g. "Australian politics")
    const queryTerms = WORLD_NEWS_QUERY_TERMS[category] || category;
    const textQuery = demonym
      ? `${demonym} ${queryTerms} OR ${countryName} ${queryTerms}`
      : `${countryName} ${queryTerms}`;
    params.set('text', textQuery);
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
async function fetchFromNewsData(country, category, apiKey, opts = {}) {
  const newsDataCategory = NEWS_DATA_CATEGORY_MAP[category] || 'politics';
  const params = new URLSearchParams({
    'category': newsDataCategory,
    'language': 'en',
    'apikey': apiKey,
  });
  if (country !== 'world') params.set('country', country);
  // NewsData.io /latest supports timeframe param (e.g. "24" for 24 hours)
  if (opts.from) params.set('from_date', opts.from);
  const url = `https://newsdata.io/api/1/latest?${params.toString()}`;
  const response = await fetch(url);
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
    // No country restriction — fetch by category section only
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
      // Use demonym+category for tighter results (e.g. "Australian politics")
      const searchQuery = category === 'world'
        ? countryName
        : demonym
          ? `"${demonym} ${category}" OR "${countryName} ${category}"`
          : `${countryName} ${category}`;
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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Guardian error: ${response.status}`);
  const data = await response.json();
  if (data.response?.status !== 'ok') throw new Error(`Guardian error: ${data.response?.message}`);
  return data.response?.results || [];
}

// ── Keyword search helpers ─────────────────────────────────────────────────
// These search APIs directly by keyword rather than by country/category top-headlines.

async function searchNewsAPIByKeyword(keyword, apiKey, domains, opts = {}) {
  const params = new URLSearchParams({
    q: keyword, domains: domains || TRUSTED_DOMAINS, language: 'en',
    sortBy: opts.sortByPopularity ? 'popularity' : 'publishedAt', pageSize: '20', apiKey,
  });
  if (opts.from) params.set('from', opts.from);
  const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
  if (!response.ok) throw new Error(`NewsAPI keyword error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error(`NewsAPI keyword error: ${data.message}`);
  return data.articles || [];
}

async function searchWorldNewsAPIByKeyword(keyword, apiKey, opts = {}) {
  const params = new URLSearchParams({
    text: keyword, language: 'en', number: '20',
    sort: opts.sortByPopularity ? 'relevance' : 'publish-time', 'sort-direction': 'DESC', 'api-key': apiKey,
  });
  if (opts.from) params.set('earliest-publish-date', opts.from);
  const response = await fetch(`https://api.worldnewsapi.com/search-news?${params}`);
  if (!response.ok) throw new Error(`WorldNewsAPI keyword error: ${response.status}`);
  const data = await response.json();
  return data.news || [];
}

async function searchNewsDataByKeyword(keyword, apiKey, opts = {}) {
  const params = new URLSearchParams({ q: keyword, language: 'en', apikey: apiKey });
  if (opts.from) params.set('from_date', opts.from);
  const response = await fetch(`https://newsdata.io/api/1/latest?${params}`);
  if (!response.ok) throw new Error(`NewsData keyword error: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(`NewsData keyword error: ${data.message}`);
  return data.results || [];
}

async function searchGuardianByKeyword(keyword, apiKey, opts = {}) {
  const params = new URLSearchParams({
    q: keyword, 'show-fields': 'trailText,thumbnail,byline,bodyText',
    'page-size': '20', 'order-by': 'newest', 'api-key': apiKey || 'test',
  });
  if (opts.from) params.set('from-date', opts.from);
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

// ── Source-country inference ─────────────────────────────────────────────────
// Map common country-code TLDs to our country codes.
// Used to infer a source's home country from its domain (e.g. smh.com.au → au).
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

// Map well-known source domains to their home countries.
// More reliable than TLD for domains like aljazeera.com (Qatar-based, English service).
const DOMAIN_TO_COUNTRY = {
  'reuters.com': 'gb',   'bbc.co.uk': 'gb',     'bbc.com': 'gb',
  'theguardian.com': 'gb', 'ft.com': 'gb',       'economist.com': 'gb',
  'nytimes.com': 'us',   'washingtonpost.com': 'us', 'cnn.com': 'us',
  'abcnews.go.com': 'us', 'cbsnews.com': 'us',   'nbcnews.com': 'us',
  'npr.org': 'us',       'pbs.org': 'us',        'politico.com': 'us',
  'wsj.com': 'us',       'bloomberg.com': 'us',  'apnews.com': 'us',
  'arstechnica.com': 'us', 'wired.com': 'us',    'techcrunch.com': 'us',
  'theverge.com': 'us',  'engadget.com': 'us',   'espn.com': 'us',
  'ign.com': 'us',       'polygon.com': 'us',    'ew.com': 'us',
  'buzzfeed.com': 'us',
  'abc.net.au': 'au',    'smh.com.au': 'au',     'theaustralian.com.au': 'au',
  'aljazeera.com': 'qa', 'france24.com': 'fr',   'dw.com': 'de',
  'scmp.com': 'hk',      'thenextweb.com': 'nl',
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
    // Check subdomains (e.g. news.com.au → au)
    for (const [domain, country] of Object.entries(DOMAIN_TO_COUNTRY)) {
      if (hostname.endsWith('.' + domain) || hostname === domain) return country;
    }
    // Fall back to TLD
    const parts = hostname.split('.');
    const tld = parts[parts.length - 1];
    if (TLD_TO_COUNTRY[tld]) return TLD_TO_COUNTRY[tld];
    // Handle .co.uk, .com.au etc.
    if (parts.length >= 3) {
      const secondLevel = parts[parts.length - 1];
      if (TLD_TO_COUNTRY[secondLevel]) return TLD_TO_COUNTRY[secondLevel];
    }
  } catch {}
  return null;
}

// Formatters — normalise each API's shape to our app format.
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
    summary_points: null,
    _meta: {
      sourceCountry: inferCountryFromUrl(sourceUrl),
    },
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
    summary_points: null,
    _meta: {
      // WorldNewsAPI provides explicit source_country — most reliable signal
      sourceCountry: article.source_country?.toLowerCase() || inferCountryFromUrl(article.url),
    },
  };
}

function formatNewsDataArticle(article, country, category) {
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
    summary_points: null,
    _meta: {
      sourceCountry: inferCountryFromUrl(sourceUrl),
    },
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
    summary_points: null,
    _meta: {
      // Guardian sectionId often encodes country (e.g. 'australia-news')
      sourceCountry: GUARDIAN_SECTION_TO_COUNTRY[result.sectionId] ?? inferCountryFromUrl(result.webUrl),
      sectionId: result.sectionId || null,
    },
  };
}

// Main handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { countries, categories, searchQuery, dateRange, sources: userSources } = req.method === 'POST' ? req.body : req.query;

  // Build per-request domain/source-ID strings when the user has selected specific sources
  const activeDomains = (userSources && userSources.length > 0)
    ? buildTrustedDomains(userSources)
    : TRUSTED_DOMAINS;
  const activeSourceIds = (userSources && userSources.length > 0)
    ? buildTrustedSourceIds(userSources)
    : TRUSTED_SOURCE_IDS;

  // ── Date range → ISO "from" date ─────────────────────────────────────────
  const dateRangeHours = { '24h': 24, '3d': 72, 'week': 168, 'month': 720 };
  const rangeHours = dateRangeHours[dateRange] || null; // null = no date restriction (e.g. 'all')
  const fromDate = rangeHours ? new Date(Date.now() - rangeHours * 60 * 60 * 1000) : null;
  const fromISO = fromDate ? fromDate.toISOString() : null; // full ISO for APIs that accept it
  const fromDateOnly = fromISO ? fromISO.split('T')[0] : null; // YYYY-MM-DD for APIs that want a date

  // For wider time windows (or no date filter), sort by popularity instead of recency.
  // This surfaces the biggest stories rather than just the latest.
  const usePopularitySort = !rangeHours || rangeHours > 24;

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
        const raw = await searchNewsAPIByKeyword(keyword, NEWS_API_KEY, activeDomains, { from: fromISO, sortByPopularity: usePopularitySort });
        const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
        results.push(...valid.map(a => formatNewsAPIArticle(a, 'world', 'world')));
        console.log(`  [1] NewsAPI keyword: ${valid.length} articles`);
      } catch (err) {
        console.error('  NewsAPI keyword search failed:', err.message);
      }

      // 2. WorldNewsAPI
      if (results.length < 10 && WORLD_NEWS_API_KEY) {
        try {
          const raw = await searchWorldNewsAPIByKeyword(keyword, WORLD_NEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort });
          results.push(...raw.map(a => formatWorldNewsAPIArticle(a, 'world', 'world')));
          console.log(`  [2] WorldNewsAPI keyword: ${raw.length} articles`);
        } catch (err) {
          console.error('  WorldNewsAPI keyword search failed:', err.message);
        }
      }

      // 3. NewsData.io
      if (results.length < 10 && NEWS_DATA_API_KEY) {
        try {
          const raw = await searchNewsDataByKeyword(keyword, NEWS_DATA_API_KEY, { from: fromDateOnly });
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
          const raw = await searchGuardianByKeyword(keyword, GUARDIAN_API_KEY, { from: fromDateOnly });
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

      // Rank by authority + coverage + recency, deduplicating similar stories
      const ranked = rankAndDeduplicateArticles(results, { usePopularity: usePopularitySort });
      // Strip internal fields before sending to client
      const clean = ranked.map(({ _meta, _coverage, ...rest }) => rest);

      return res.status(200).json({ status: 'ok', articles: clean, totalResults: clean.length, cached: false });
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
    const trendingCategories = ['technology', 'business', 'politics', 'science', 'health', 'sports', 'gaming', 'film', 'tv'];
    const trendingCacheKey = getCacheKey('world', 'trending', dateRange);

    if (isCacheValid(CACHE[trendingCacheKey])) {
      console.log(`Cache HIT: ${trendingCacheKey}`);
      return res.status(200).json({ status: 'ok', articles: CACHE[trendingCacheKey].articles, totalResults: CACHE[trendingCacheKey].articles.length, cached: true });
    }

    try {
      console.log('Fetching trending articles across all categories (parallel)');

      // Fetch all categories in parallel to avoid serverless timeout
      const categoryResults = await Promise.allSettled(
        trendingCategories.map(async (cat) => {
          const catCacheKey = getCacheKey('world', cat, dateRange);
          if (isCacheValid(CACHE[catCacheKey])) {
            return CACHE[catCacheKey].articles;
          }
          const raw = await fetchFromNewsAPI('world', cat, NEWS_API_KEY, activeDomains, activeSourceIds, { sortByPopularity: true });
          const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
          const formatted = valid.map(a => formatNewsAPIArticle(a, 'world', cat));
          const clean = formatted.map(({ _meta, ...rest }) => rest);
          CACHE[catCacheKey] = { timestamp: Date.now(), articles: clean };
          return clean;
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

      // Rank by authority + coverage, dedup similar stories, take top 10
      const top10 = rankAndDeduplicateArticles(trendingArticles, { usePopularity: true })
        .map(({ _coverage, ...rest }) => rest)
        .slice(0, 10);

      // Generate AI summaries for the top 5
      if (HAS_LLM && top10.length > 0) {
        await Promise.all(top10.slice(0, 5).map(async (article) => {
          try {
            const summary = await generateSummary(article, LLM_KEYS);
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
        const cacheKey = getCacheKey(country, category, dateRange);

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
            const raw = await fetchFromNewsAPI(country, category, NEWS_API_KEY, activeDomains, activeSourceIds, { from: fromISO, sortByPopularity: usePopularitySort });
            const valid = raw.filter(a => a.title && a.title !== '[Removed]' && a.url !== 'https://removed.com');
            formattedArticles = valid.map(a => formatNewsAPIArticle(a, country, category));
          } catch (err) {
            console.error(`  NewsAPI failed:`, err.message);
          }
        }

        // ── 2. WorldNewsAPI (secondary, very broad) ───────────────────────────
        if (formattedArticles.length < 10 && WORLD_NEWS_API_KEY && (country === 'world' || WORLD_NEWS_API_SUPPORTED_COUNTRIES.has(country))) {
          console.log(`  [2] WorldNewsAPI [${country}/${category}] (have ${formattedArticles.length} so far)`);
          try {
            const raw = await fetchFromWorldNewsAPI(country, category, WORLD_NEWS_API_KEY, { from: fromISO, sortByPopularity: usePopularitySort });
            const extra = raw.map(a => formatWorldNewsAPIArticle(a, country, category));
            formattedArticles = [...formattedArticles, ...extra];
          } catch (err) {
            console.error(`  WorldNewsAPI failed:`, err.message);
          }
        }

        // ── 3. NewsData.io (tertiary, broadest coverage) ──────────────────────
        if (formattedArticles.length < 10 && NEWS_DATA_API_KEY && (country === 'world' || NEWS_DATA_SUPPORTED_COUNTRIES.has(country))) {
          console.log(`  [3] NewsData.io [${country}/${category}] (have ${formattedArticles.length} so far)`);
          try {
            const raw = await fetchFromNewsData(country, category, NEWS_DATA_API_KEY, { from: fromDateOnly });
            const valid = raw.filter(a => a.title && a.title !== '[Removed]');
            const extra = valid.map(a => formatNewsDataArticle(a, country, category));
            formattedArticles = [...formattedArticles, ...extra];
          } catch (err) {
            console.error(`  NewsData failed:`, err.message);
          }
        }

        // ── 4. The Guardian (always tried — strong for AU/GB/US) ──────────────
        if (formattedArticles.length < 10 && GUARDIAN_API_KEY) {
          console.log(`  [4] Guardian [${country}/${category}] (have ${formattedArticles.length} so far)`);
          try {
            const results = await fetchFromGuardian(country, category, GUARDIAN_API_KEY, { from: fromDateOnly });
            const extra = results.map(r => formatGuardianArticle(r, country, category));
            formattedArticles = [...formattedArticles, ...extra];
          } catch (err) {
            console.error(`  Guardian failed:`, err.message);
          }
        }

        // ── Category relevance filter ────────────────────────────────────────
        // Drop articles that don't match the requested category at all.
        // This catches off-topic articles that APIs return (e.g. human interest
        // stories from a country section when we asked for politics).
        const beforeCatFilter = formattedArticles.length;
        formattedArticles = formattedArticles.filter(a => articleMatchesCategory(a, category));
        if (formattedArticles.length < beforeCatFilter) {
          console.log(`  Category filter: kept ${formattedArticles.length}/${beforeCatFilter} for [${category}]`);
        }

        // ── Country relevance filter (multi-signal) ─────────────────────────
        // Scores each article and sorts so most relevant appear first.
        // Only articles with a positive relevance score are kept.
        if (country !== 'world' && formattedArticles.length > 0) {
          const scored = formattedArticles.map(a => {
            let score = 0;
            const { inTitle, inText } = articleMentionsCountry(a, country);
            if (inTitle) score += 4;
            else if (inText) score += 2;
            const metaCountry = a._meta?.sourceCountry;
            if (metaCountry === country) score += 2;
            return { article: a, score };
          });
          scored.sort((a, b) => b.score - a.score);
          const relevant = scored.filter(s => s.score > 0).map(s => s.article);
          // Only keep relevant articles — no score-0 padding
          if (relevant.length > 0) {
            formattedArticles = relevant;
          }
          console.log(`  Country filter: ${relevant.length} relevant of ${scored.length} for [${country}]`);
        }

        // ── AI summaries for first 5 filtered articles ──────────────────────
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

        // Strip _meta before caching so cached responses are clean
        const cleanForCache = formattedArticles.map(({ _meta, ...rest }) => rest);
        CACHE[cacheKey] = { timestamp: Date.now(), articles: cleanForCache };
        allArticles.push(...cleanForCache);
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

    // Rank by authority + coverage + recency, deduplicating similar stories
    const rankedArticles = rankAndDeduplicateArticles(filteredArticles, { usePopularity: usePopularitySort });

    // Strip internal fields before sending to the client
    const cleanArticles = rankedArticles.map(({ _meta, _coverage, ...rest }) => rest);

    return res.status(200).json({
      status: 'ok',
      articles: cleanArticles,
      totalResults: cleanArticles.length,
      cached: false
    });

  } catch (error) {
    console.error('News fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch news', message: error.message });
  }
}
