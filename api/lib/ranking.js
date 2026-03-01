// api/lib/ranking.js
// Multi-signal article ranking and deduplication engine.
// Extracted from api/news.js.
//
// Signals used (see rankAndDeduplicateArticles for weights):
//   1. Source Authority      — outlet tier (wire service > national > niche)
//   2. Cross-Source Coverage — how many distinct outlets cover the story
//   3. Freshness             — exponential decay
//   4. Content Depth         — articles with fuller text rank higher
//   5. Category Relevance    — match strength against the requested topic
//   6. Country Relevance     — how strongly the article covers the target country
//   7. Keyword Relevance     — match strength for keyword searches (Signal 7)

import { CATEGORY_RELEVANCE_KEYWORDS, getSourceDomain } from './articleFilter.js';

// ── Source authority tiers ─────────────────────────────────────────────────
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
  'caixinglobal.com': 2, 'asia.nikkei.com': 2,
  'dailymaverick.co.za': 2, 'koreaherald.com': 2, 'channelnewsasia.com': 2,
  'kyivindependent.com': 2, 'timesofisrael.com': 2, 'arabnews.com': 2,
  'thenationalnews.com': 2, 'bangkokpost.com': 2, 'mercopress.com': 2,
  // Tier 1 — quality regionals
  'brazilianreport.com': 1, 'batimes.com.ar': 1, 'mexiconewsdaily.com': 1,
  'businessday.ng': 1, 'nation.africa': 1, 'africanews.com': 1,
  'middleeasteye.net': 1, 'jakartaglobe.id': 1, 'inquirer.net': 1,
  'rappler.com': 1, 'notesfrompoland.com': 1, 'meduza.io': 1,
};

export function getSourceTier(article) {
  const domain = getSourceDomain(article);
  return SOURCE_AUTHORITY_TIER[domain] || 1;
}

// ── Stop words ────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'it', 'its', 'that',
  'this', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'when',
  'where', 'why', 'not', 'no', 'nor', 'than', 'too', 'very', 'just',
  'about', 'over', 'after', 'before', 'between', 'under', 'above', 'into',
  'through', 'during', 'each', 'some', 'such', 'only', 'also', 'more',
  'most', 'other', 'new', 'says', 'said', 'according', 'report', 'news',
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
    .replace(/[''"""\-–—:,.|!?'()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(normTitle) {
  return normTitle.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

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

function contentDepthScore(article) {
  const desc = (article.description || '').length;
  const content = (article.content || '').length;
  if (content < 50 && desc < 30) return 0;
  const descScore = Math.min(desc / 150, 1) * 0.3;
  const contentScore = Math.min(content / 500, 1) * 0.7;
  return descScore + contentScore;
}

function categoryRelevanceScore(article, category) {
  if (category === 'world') return 0.5;
  const catKeywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!catKeywords) return 0.5;

  const title = (article.title || '').toLowerCase();
  const text = `${title} ${article.description || ''}`.toLowerCase();
  let score = 0;

  for (const kw of catKeywords.strong) {
    if (text.includes(kw)) { score += 2; if (title.includes(kw)) score += 1; }
  }
  for (const kw of catKeywords.weak) {
    if (text.includes(kw)) { score += 1; if (title.includes(kw)) score += 0.5; }
  }
  return Math.min(score / 8, 1);
}

// ── Keyword relevance scoring (Signal 7) ──────────────────────────────────

function stemWord(word) {
  if (word.length < 5) return word;
  const rules = [
    [/ational$/, 'ate'], [/tional$/, 'tion'], [/ations?$/, 'ate'],
    [/izing$/, 'ize'],   [/ising$/, 'ise'],   [/ness$/, ''],
    [/ment$/, ''],       [/ings?$/, ''],       [/edly$/, ''],
    [/ingly$/, ''],      [/ated?$/, ''],       [/iers?$/, 'y'],
    [/ies$/, 'y'],       [/ers?$/, ''],        [/ed$/, ''],
    [/ly$/, ''],         [/es$/, ''],          [/s$/, ''],
  ];
  for (const [pattern, replacement] of rules) {
    const result = word.replace(pattern, replacement);
    if (result !== word && result.length >= 3) return result;
  }
  return word;
}

export function keywordRelevanceScore(article, searchTerms, rawKeyword) {
  if (!searchTerms || searchTerms.length === 0) return 0;
  const title = (article.title || '').toLowerCase();
  const desc = (article.description || '').toLowerCase();
  const content = (article.content || '').toLowerCase();
  let score = 0;

  if (rawKeyword) {
    const phrase = rawKeyword.trim().toLowerCase();
    if (phrase.includes(' ') && !/\b(and|or|not)\b/i.test(phrase)) {
      if (title.includes(phrase))     score += 5;
      else if (desc.includes(phrase)) score += 2.5;
    }
  }

  for (const term of searchTerms) {
    const t = term.toLowerCase().replace(/^["'(]+|["')]+$/g, '');
    if (t.length < 2) continue;
    const tStem = stemWord(t);
    const inTitle   = title.includes(t)   || (tStem !== t && title.includes(tStem));
    const inDesc    = desc.includes(t)    || (tStem !== t && desc.includes(tStem));
    const inContent = content.includes(t) || (tStem !== t && content.includes(tStem));
    if (inTitle)   score += 3;
    if (inDesc)    score += 1;
    if (inContent) score += 0.5;
  }
  return Math.min(score / 8, 1);
}

// ── Main ranking function ─────────────────────────────────────────────────

/**
 * Deduplicate and rank a flat list of articles using up to 7 signals.
 * @param {object[]} articles
 * @param {object}   opts
 * @param {boolean}  [opts.usePopularity=false] - Shift weights toward authority/coverage
 * @param {string|null} [opts.category]
 * @param {string[]|null} [opts.searchTerms] - Activates Signal 7
 * @param {string|null}   [opts.rawKeyword]  - Used for exact-phrase bonus
 * @param {boolean}  [opts.keywordMode=false] - Precision monitoring mode weights
 * @param {number|null} [opts.rangeHours] - Hours of the requested date window (scales freshness half-life)
 * @returns {object[]} Ranked articles (one representative per cluster)
 */
export function rankAndDeduplicateArticles(articles, {
  usePopularity = false,
  category = null,
  searchTerms = null,
  rawKeyword = null,
  keywordMode = false,
  rangeHours = null,
} = {}) {
  if (articles.length === 0) return [];

  // 1. Build IDF map
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
    idfMap.set(word, Math.log(n / freq) + 1);
  }

  // 2. Pre-compute signals
  const items = articles.map((a, i) => ({
    article: a,
    keywords: allKeywords[i],
    tier: getSourceTier(a),
    timestamp: new Date(a.publishedAt).getTime() || 0,
    depth: contentDepthScore(a),
    catRelevance: categoryRelevanceScore(a, category || a.category),
    countryRel: a._countryScore ?? -1,
    kwRelevance: searchTerms ? keywordRelevanceScore(a, searchTerms, rawKeyword) : -1,
    domain: getSourceDomain(a),
  }));

  // 3. Cluster by title similarity
  const clusters = [];
  const assigned = new Set();
  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [items[i]];
    assigned.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (titleSimilarity(items[i].keywords, items[j].keywords, idfMap) > 0.65) {
        cluster.push(items[j]);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  // 4. Score each cluster
  const now = Date.now();
  // Scale freshness half-life to the requested date window so that articles
  // from across the full window remain differentiated by recency.
  // Target: half-life = 20% of the window, floored at 3h, capped at 120h.
  //   24h  → 4.8h  (tight: articles lose relevance within hours)
  //   3d   → 14.4h (moderate: yesterday's stories still competitive)
  //   week → 33.6h (broad: stories from mid-week stay in the mix)
  //   month→ 120h  (5-day cap: best of the month stays visible)
  // Popularity mode (no date filter) keeps the existing 48h half-life.
  const FRESHNESS_RATIO = 0.20;
  const MIN_HALF_LIFE_MS = 3 * 3_600_000;    // 3h floor
  const MAX_HALF_LIFE_MS = 120 * 3_600_000;  // 120h ceiling
  const halfLife = (usePopularity && !rangeHours)
    ? 48 * 3_600_000
    : rangeHours
      ? Math.min(Math.max(rangeHours * FRESHNESS_RATIO * 3_600_000, MIN_HALF_LIFE_MS), MAX_HALF_LIFE_MS)
      : 6 * 3_600_000; // default: existing 6h behaviour for non-windowed queries

  const scored = clusters.map(cluster => {
    // Sort cluster members to find the best representative.
    // Tier first, then category relevance as a tiebreaker to promote the most
    // on-topic article, then depth and recency.
    cluster.sort((a, b) => b.tier - a.tier || b.catRelevance - a.catRelevance || b.depth - a.depth || b.timestamp - a.timestamp);
    const best = cluster[0];
    const uniqueSources = [...new Set(cluster.map(c => c.domain))];
    const coverageCount = uniqueSources.length;

    const authority = best.tier === 3 ? 10 : best.tier === 2 ? 7 : 4;
    const coverage  = Math.min((coverageCount - 1) * 3, 10);
    const ageMs     = Math.max(now - best.timestamp, 0);
    const freshness = 10 * Math.pow(2, -ageMs / halfLife);
    const depth     = best.depth * 5;
    // Blend the representative's own category score (70%) with the cluster max (30%).
    // Pure max caused a mismatch: a tier-3 article with low category relevance could
    // borrow a high score from a more-relevant cluster member, inflating its ranking.
    const repCatRelevance = best.catRelevance;
    const maxCatRelevance = Math.max(...cluster.map(c => c.catRelevance));
    const catScore  = (repCatRelevance * 0.7 + maxCatRelevance * 0.3) * 8;
    const bestCountryRel   = Math.max(...cluster.map(c => c.countryRel));
    const countryRelScore  = bestCountryRel === -1 ? 4 : bestCountryRel;
    const bestKwRel        = Math.max(...cluster.map(c => c.kwRelevance));
    const kwRelevanceScore = bestKwRel === -1 ? 0 : bestKwRel * 10;

    return {
      article: { ...best.article, _coverage: coverageCount > 1 ? { count: coverageCount, sources: uniqueSources } : undefined },
      signals: { authority, coverage, freshness, depth, catScore, countryRelScore, kwRelevanceScore },
      coverageCount,
      domain: best.domain,
    };
  });

  // 5. Apply time-window-dependent weights
  const hasKeywordSearch = searchTerms && searchTerms.length > 0;
  // Weight table — effective max points = weight × signal_max:
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
      authority        * W.authority +
      coverage         * W.coverage +
      freshness        * W.freshness +
      depth            * W.depth +
      catScore         * W.cat +
      countryRelScore  * W.countryRel +
      kwRelevanceScore * W.kwRel;
  }

  // 6. Sort and diversity re-rank
  scored.sort((a, b) => b.totalScore - a.totalScore);

  const domainCount = {};
  const MAX_PER_DOMAIN = 2;
  for (const s of scored) {
    domainCount[s.domain] = (domainCount[s.domain] || 0) + 1;
    if (domainCount[s.domain] > MAX_PER_DOMAIN) s._demoted = true;
  }

  scored.sort((a, b) => {
    if (a._demoted !== b._demoted) return a._demoted ? 1 : -1;
    return b.totalScore - a.totalScore;
  });

  return scored.map(s => s.article);
}
