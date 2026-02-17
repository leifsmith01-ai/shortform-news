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
  il: 'Israel', ae: 'UAE', sa: 'Saudi Arabia', tr: 'Turkey', qa: 'Qatar',
  kw: 'Kuwait', bh: 'Bahrain', om: 'Oman', jo: 'Jordan', lb: 'Lebanon',
  iq: 'Iraq', ir: 'Iran',
  // Africa
  za: 'South Africa', ng: 'Nigeria', eg: 'Egypt', ke: 'Kenya', ma: 'Morocco',
  gh: 'Ghana', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', sn: 'Senegal',
  ci: 'Ivory Coast', cm: 'Cameroon', dz: 'Algeria', tn: 'Tunisia', rw: 'Rwanda',
  // Oceania
  au: 'Australia', nz: 'New Zealand', fj: 'Fiji', pg: 'Papua New Guinea',
};

const CATEGORY_NAMES = {
  technology: 'Technology', business: 'Business', science: 'Science', health: 'Health',
  sports: 'Sports', entertainment: 'Entertainment', politics: 'Politics', world: 'World'
};

export default function GroupedArticles({ articles, groupBy }) {
  const grouped = React.useMemo(() => {
    const groups = {};
    articles.forEach(article => {
      const key = groupBy === 'country' ? article.country : article.category;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(article);
    });
    return groups;
  }, [articles, groupBy]);

  const getGroupName = (key) => {
    return groupBy === 'country' ? COUNTRY_NAMES[key] || key : CATEGORY_NAMES[key] || key;
  };

  return (
    <div className="space-y-12">
      {Object.entries(grouped).map(([key, groupArticles]) => (
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {groupArticles.map((article, index) => (
              <NewsCard key={index} article={article} index={index} rank={index + 1} />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}