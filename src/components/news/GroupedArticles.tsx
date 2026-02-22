import React from 'react';
import { motion } from 'framer-motion';
import NewsCard from './NewsCard';

const COUNTRY_NAMES: Record<string, string> = {
  // North America
  us: 'United States', ca: 'Canada', mx: 'Mexico', cu: 'Cuba', jm: 'Jamaica',
  cr: 'Costa Rica', pa: 'Panama', do: 'Dominican Republic', gt: 'Guatemala', hn: 'Honduras',
  // South America
  br: 'Brazil', ar: 'Argentina', cl: 'Chile', co: 'Colombia', pe: 'Peru',
  ve: 'Venezuela', ec: 'Ecuador', uy: 'Uruguay', py: 'Paraguay', bo: 'Bolivia',
  // Europe
  gb: 'United Kingdom', de: 'Germany', fr: 'France', it: 'Italy', es: 'Spain',
  nl: 'Netherlands', se: 'Sweden', no: 'Norway', pl: 'Poland', ch: 'Switzerland',
  be: 'Belgium', at: 'Austria', ie: 'Ireland', pt: 'Portugal', dk: 'Denmark',
  fi: 'Finland', gr: 'Greece', cz: 'Czech Republic', ro: 'Romania', hu: 'Hungary',
  ua: 'Ukraine', rs: 'Serbia', hr: 'Croatia', bg: 'Bulgaria', sk: 'Slovakia',
  lt: 'Lithuania', lv: 'Latvia', ee: 'Estonia', is: 'Iceland', lu: 'Luxembourg',
  // Asia
  cn: 'China', jp: 'Japan', in: 'India', kr: 'South Korea', sg: 'Singapore',
  hk: 'Hong Kong', tw: 'Taiwan', id: 'Indonesia', th: 'Thailand', my: 'Malaysia',
  ph: 'Philippines', vn: 'Vietnam', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka',
  mm: 'Myanmar', kh: 'Cambodia', np: 'Nepal',
  // Middle East
  il: 'Israel', ps: 'Palestine', ae: 'UAE', sa: 'Saudi Arabia', tr: 'Turkey', qa: 'Qatar',
  kw: 'Kuwait', bh: 'Bahrain', om: 'Oman', jo: 'Jordan', lb: 'Lebanon',
  iq: 'Iraq', ir: 'Iran',
  // Africa
  za: 'South Africa', ng: 'Nigeria', eg: 'Egypt', ke: 'Kenya', ma: 'Morocco',
  gh: 'Ghana', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', sn: 'Senegal',
  ci: 'Ivory Coast', cm: 'Cameroon', dz: 'Algeria', tn: 'Tunisia', rw: 'Rwanda',
  // Oceania
  au: 'Australia', nz: 'New Zealand', fj: 'Fiji', pg: 'Papua New Guinea',
  // Special
  world: 'World',
};

const CATEGORY_NAMES = {
  technology: 'Technology', business: 'Business', science: 'Science', health: 'Health',
  sports: 'Sports', gaming: 'Gaming', film: 'Film', tv: 'TV',
  politics: 'Politics', world: 'World'
};

// NewsAPI free tier only supports top-headlines for these country codes
const SUPPORTED_COUNTRIES = new Set([
  'ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn', 'co', 'cu', 'cz',
  'de', 'eg', 'fr', 'gb', 'gr', 'hk', 'hu', 'id', 'ie', 'il', 'in', 'it', 'jp',
  'kr', 'lt', 'lv', 'ma', 'mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt',
  'ro', 'rs', 'ru', 'sa', 'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw', 'ua', 'us',
  've', 'za', 'world'
]);

export default function GroupedArticles({ articles, groupBy, selectedKeys = [] }: {
  articles: any[];
  groupBy: string;
  selectedKeys?: string[];
}) {
  const grouped = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    // Pre-populate all selected keys so empty ones are visible
    selectedKeys.forEach(key => { groups[key] = []; });
    articles.forEach(article => {
      const key = groupBy === 'country' ? article.country : article.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(article);
    });
    return groups;
  }, [articles, groupBy, selectedKeys]);

  const getGroupName = (key: string) => {
    return groupBy === 'country' ? COUNTRY_NAMES[key] || key : CATEGORY_NAMES[key] || key;
  };

  const getEmptyReason = (key: string) => {
    if (groupBy === 'country' && !SUPPORTED_COUNTRIES.has(key)) {
      return 'Not available on free plan — NewsAPI only supports ~55 countries for top headlines.';
    }
    return 'No articles found for this selection. Try a different category or time period.';
  };

  return (
    <div className="space-y-12">
      {Object.entries(grouped).map(([key, groupArticles]: [string, any[]]) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-bold text-stone-900 mb-6 flex items-center gap-3">
            <span className="w-1 h-8 bg-slate-900 rounded-full" />
            {getGroupName(key)}
            <span className="text-sm font-normal text-stone-400">
              ({groupArticles.length} {groupArticles.length === 1 ? 'article' : 'articles'})
            </span>
          </h2>
          {groupArticles.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm max-w-xl">
              <span className="text-lg leading-none mt-0.5">⚠️</span>
              <p>{getEmptyReason(key)}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {groupArticles.map((article, index) => (
                <NewsCard key={index} article={article} index={index} rank={index + 1} />
              ))}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}