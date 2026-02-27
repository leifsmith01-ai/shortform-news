// api/lib/articleFilter.js
// Country and category relevance data + article matching functions.
// Extracted from api/news.js to allow independent testing and reuse.

// ── Country name lookup ────────────────────────────────────────────────────
export const COUNTRY_NAMES = {
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

// ── Demonyms for query building ────────────────────────────────────────────
export const COUNTRY_DEMONYMS = {
  us: 'American',   ca: 'Canadian',    mx: 'Mexican',      cu: 'Cuban',
  jm: 'Jamaican',   cr: 'Costa Rican', pa: 'Panamanian',   do: 'Dominican',
  gt: 'Guatemalan', hn: 'Honduran',
  br: 'Brazilian',  ar: 'Argentine',   cl: 'Chilean',      co: 'Colombian',
  pe: 'Peruvian',   ve: 'Venezuelan',  ec: 'Ecuadorian',   uy: 'Uruguayan',
  py: 'Paraguayan', bo: 'Bolivian',
  gb: 'British',    de: 'German',      fr: 'French',       it: 'Italian',
  es: 'Spanish',    nl: 'Dutch',       se: 'Swedish',      no: 'Norwegian',
  pl: 'Polish',     ch: 'Swiss',       be: 'Belgian',      at: 'Austrian',
  ie: 'Irish',      pt: 'Portuguese',  dk: 'Danish',       fi: 'Finnish',
  gr: 'Greek',      cz: 'Czech',       ro: 'Romanian',     hu: 'Hungarian',
  ua: 'Ukrainian',  rs: 'Serbian',     hr: 'Croatian',     bg: 'Bulgarian',
  sk: 'Slovak',     lt: 'Lithuanian',  lv: 'Latvian',      ee: 'Estonian',
  is: 'Icelandic',  lu: 'Luxembourgish', si: 'Slovenian',  ru: 'Russian',
  cn: 'Chinese',    jp: 'Japanese',    in: 'Indian',       kr: 'South Korean',
  sg: 'Singaporean', hk: 'Hong Kong', tw: 'Taiwanese',    id: 'Indonesian',
  th: 'Thai',       my: 'Malaysian',   ph: 'Philippine',   vn: 'Vietnamese',
  pk: 'Pakistani',  bd: 'Bangladeshi', lk: 'Sri Lankan',   mm: 'Myanmar',
  kh: 'Cambodian',  np: 'Nepalese',
  au: 'Australian', nz: 'New Zealand', fj: 'Fijian',       pg: 'Papua New Guinean',
  il: 'Israeli',    ps: 'Palestinian', ae: 'Emirati',      sa: 'Saudi',
  tr: 'Turkish',    qa: 'Qatari',      kw: 'Kuwaiti',      bh: 'Bahraini',
  om: 'Omani',      jo: 'Jordanian',   lb: 'Lebanese',     iq: 'Iraqi',
  ir: 'Iranian',
  za: 'South African', ng: 'Nigerian', eg: 'Egyptian',     ke: 'Kenyan',
  ma: 'Moroccan',   gh: 'Ghanaian',    et: 'Ethiopian',    tz: 'Tanzanian',
  ug: 'Ugandan',    sn: 'Senegalese',  ci: 'Ivorian',      cm: 'Cameroonian',
  dz: 'Algerian',   tn: 'Tunisian',    rw: 'Rwandan',
};

// ── Category query nouns (for building search queries) ─────────────────────
export const CATEGORY_QUERY_NOUNS = {
  politics:   ['politics', 'government', 'election', 'parliament', 'prime minister', 'legislation', 'policy'],
  world:      ['foreign policy', 'diplomacy', 'trade deal', 'international relations', 'summit'],
  business:   ['economy', 'market', 'industry', 'trade', 'central bank', 'stocks', 'finance'],
  technology: ['tech', 'startup', 'innovation', 'digital', 'AI', 'software', 'cybersecurity'],
  science:    ['research', 'science', 'discovery', 'climate', 'space', 'laboratory', 'environment'],
  health:     ['health', 'hospital', 'healthcare', 'medical', 'disease', 'public health'],
  sports:     ['sport', 'team', 'league', 'championship', 'football', 'cricket', 'athlete'],
  gaming:     ['gaming', 'video game', 'esports', 'game industry'],
  film:       ['film', 'movie', 'cinema', 'box office', 'film industry'],
  tv:         ['television', 'TV', 'streaming', 'TV series', 'broadcast'],
};

// ── Category relevance keywords ────────────────────────────────────────────
// Two tiers per category:
//   strong: Domain-specific terms. A single match confirms relevance.
//   weak:   Common terms. Require 2+ matches (or 1 match in title) to confirm.
export const CATEGORY_RELEVANCE_KEYWORDS = {
  politics: {
    strong: [
      'politi', 'parliament', 'legislat', 'senator', 'congress',
      'ballot', 'referendum', 'bipartisan', 'geopoliti', 'impeach',
      'inaugurat', 'gubernator', 'governorship', 'caucus', 'filibuster',
      'executive order', 'head of state', 'prime minister', 'veto',
    ],
    weak: [
      'government', 'elect', 'minister', 'president', 'vote', 'voter',
      'opposition', 'coalition', 'campaign', 'democrat', 'republican',
      'labor party', 'liberal', 'conservative', 'cabinet', 'regulation',
      'policy', 'reform', 'constitutional', 'sanction', 'diplomatic',
      'nato', 'tariff', 'populis', 'authoritar', 'regime', 'judiciary',
      'governance', 'sovereignty', 'junta', 'coup',
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
  gaming: {
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
    strong: [
      'box office', 'screenplay', 'hollywood', 'blockbuster',
      'oscar', 'academy award', 'golden globe', 'bafta',
      'film festival', 'cannes', 'sundance', 'tribeca',
      'cinematograph', 'film director',
    ],
    weak: [
      'film', 'movie', 'cinema', 'director', 'actor', 'actress',
      'premiere', 'sequel', 'franchise', 'animation', 'documentary',
      'trailer', 'film critic', 'casting',
    ],
  },
  tv: {
    strong: [
      'tv show', 'tv series', 'showrunner', 'series finale',
      'primetime', 'cable network', 'reality tv', 'talk show',
      'miniseries', 'anthology series', 'sitcom', 'drama series',
      'late night', 'television show',
    ],
    weak: [
      'television', 'netflix', 'hbo', 'disney+', 'episode',
      'renewal', 'cancell', 'streaming service', 'season premiere',
      'season finale', 'reboot', 'spinoff', 'broadcast',
      'emmys', 'emmy',
    ],
  },
};

// ── Source domain helpers ──────────────────────────────────────────────────

/** International wire services — should not get a home-country relevance boost. */
export const INTERNATIONAL_SOURCES = new Set([
  'reuters.com', 'apnews.com', 'bbc.co.uk', 'bbc.com',
  'aljazeera.com', 'france24.com', 'dw.com',
  'theconversation.com',
]);

/** Normalise a source URL to its bare hostname (no www.). */
export function getSourceDomain(article) {
  try {
    if (article.url) return new URL(article.url).hostname.replace(/^www\./, '');
  } catch {}
  return '';
}

/** Returns true if the article comes from an international/wire-service outlet. */
export function isInternationalSource(article) {
  return INTERNATIONAL_SOURCES.has(getSourceDomain(article));
}

// ── Article matching functions ─────────────────────────────────────────────

/** Count how many keywords from a list appear in text. */
export function countKeywordHits(text, keywords) {
  let hits = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) hits++;
  }
  return hits;
}

/**
 * Returns true if an article matches the given category.
 * Uses a two-tier keyword system: any strong match OR 2+ weak matches confirm relevance.
 */
export function articleMatchesCategory(article, category) {
  if (category === 'world') return true;
  const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!catKeywords) return true;

  const title = (article.title || '').toLowerCase();
  const text = `${title} ${article.description || ''}`.toLowerCase();

  if (catKeywords.strong.some(kw => text.includes(kw))) return true;

  const weakHits = countKeywordHits(text, catKeywords.weak);
  if (weakHits >= 2) return true;
  if (weakHits === 1 && catKeywords.weak.some(kw => title.includes(kw))) return true;

  return false;
}

/**
 * Get the relevance terms for a country (from COUNTRY_RELEVANCE_KEYWORDS or fallback).
 * Note: COUNTRY_RELEVANCE_KEYWORDS is defined in news.js and passed in; this function
 * is provided as a dependency-injected helper to keep this module testable without
 * importing the large COUNTRY_RELEVANCE_KEYWORDS constant directly.
 */
export function getCountryTermsFn(countryRelevanceKeywords, countryNames) {
  return function getCountryTerms(country) {
    if (countryRelevanceKeywords[country]) return countryRelevanceKeywords[country];
    const name = countryNames[country];
    return name ? [name.toLowerCase()] : [country.toLowerCase()];
  };
}

/**
 * Check whether an article mentions a country in its title, text, or content.
 * Returns { inTitle, inText, termHits }.
 */
export function articleMentionsCountryFn(getCountryTerms) {
  return function articleMentionsCountry(article, country) {
    const terms = getCountryTerms(country);
    const title = (article.title || '').toLowerCase();
    const desc = (article.description || '').toLowerCase();
    const content = (article.content || '').toLowerCase();
    const text = `${title} ${desc}`;
    const fullText = `${text} ${content}`;

    const inTitle = terms.some(term => title.includes(term));
    const inText  = terms.some(term => text.includes(term));

    let termHits = 0;
    for (const term of terms) {
      if (fullText.includes(term)) termHits++;
    }
    return { inTitle, inText, termHits };
  };
}

/**
 * Build a nationally-focused search query for /v2/everything.
 * Combines tight exact phrases with a looser fallback for precision + recall.
 */
export function buildNationalQuery(country, category) {
  const demonym = COUNTRY_DEMONYMS[country];
  const countryName = COUNTRY_NAMES[country] || country;
  const nouns = CATEGORY_QUERY_NOUNS[category] || [category];

  const phrases = [];
  for (const noun of nouns) {
    if (demonym) phrases.push(`"${demonym} ${noun}"`);
    phrases.push(`"${countryName} ${noun}"`);
  }

  const topicKeywords = nouns.slice(0, 5).join(' OR ');
  const looseTerm = demonym
    ? `(${demonym} OR ${countryName}) AND (${topicKeywords})`
    : `${countryName} AND (${topicKeywords})`;

  return `(${phrases.join(' OR ')} OR ${looseTerm})`;
}
