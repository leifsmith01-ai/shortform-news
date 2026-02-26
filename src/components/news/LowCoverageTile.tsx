import React from 'react';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';

const COUNTRY_NAMES: Record<string, string> = {
  us: 'United States', ca: 'Canada', mx: 'Mexico', cu: 'Cuba', jm: 'Jamaica',
  cr: 'Costa Rica', pa: 'Panama', do: 'Dominican Republic', gt: 'Guatemala', hn: 'Honduras',
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

const COUNTRY_FLAGS: Record<string, string> = {
  us: '🇺🇸', ca: '🇨🇦', mx: '🇲🇽', cu: '🇨🇺', jm: '🇯🇲',
  cr: '🇨🇷', pa: '🇵🇦', do: '🇩🇴', gt: '🇬🇹', hn: '🇭🇳',
  br: '🇧🇷', ar: '🇦🇷', cl: '🇨🇱', co: '🇨🇴', pe: '🇵🇪',
  ve: '🇻🇪', ec: '🇪🇨', uy: '🇺🇾', py: '🇵🇾', bo: '🇧🇴',
  gb: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', it: '🇮🇹', es: '🇪🇸',
  nl: '🇳🇱', se: '🇸🇪', no: '🇳🇴', pl: '🇵🇱', ch: '🇨🇭',
  be: '🇧🇪', at: '🇦🇹', ie: '🇮🇪', pt: '🇵🇹', dk: '🇩🇰',
  fi: '🇫🇮', gr: '🇬🇷', cz: '🇨🇿', ro: '🇷🇴', hu: '🇭🇺',
  ua: '🇺🇦', rs: '🇷🇸', hr: '🇭🇷', bg: '🇧🇬', sk: '🇸🇰',
  lt: '🇱🇹', lv: '🇱🇻', ee: '🇪🇪', is: '🇮🇸', lu: '🇱🇺',
  cn: '🇨🇳', jp: '🇯🇵', in: '🇮🇳', kr: '🇰🇷', sg: '🇸🇬',
  hk: '🇭🇰', tw: '🇹🇼', id: '🇮🇩', th: '🇹🇭', my: '🇲🇾',
  ph: '🇵🇭', vn: '🇻🇳', pk: '🇵🇰', bd: '🇧🇩', lk: '🇱🇰',
  mm: '🇲🇲', kh: '🇰🇭', np: '🇳🇵',
  il: '🇮🇱', ps: '🇵🇸', ae: '🇦🇪', sa: '🇸🇦', tr: '🇹🇷', qa: '🇶🇦',
  kw: '🇰🇼', bh: '🇧🇭', om: '🇴🇲', jo: '🇯🇴', lb: '🇱🇧',
  iq: '🇮🇶', ir: '🇮🇷',
  za: '🇿🇦', ng: '🇳🇬', eg: '🇪🇬', ke: '🇰🇪', ma: '🇲🇦',
  gh: '🇬🇭', et: '🇪🇹', tz: '🇹🇿', ug: '🇺🇬', sn: '🇸🇳',
  ci: '🇨🇮', cm: '🇨🇲', dz: '🇩🇿', tn: '🇹🇳', rw: '🇷🇼',
  au: '🇦🇺', nz: '🇳🇿', fj: '🇫🇯', pg: '🇵🇬',
};

interface LowCoverageItem {
  country: string;
  category: string;
  count: number;
}

interface LowCoverageTileProps {
  items: LowCoverageItem[];
  index?: number;
}

export default function LowCoverageTile({ items, index = 0 }: LowCoverageTileProps) {
  if (!items || items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className="col-span-full rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center flex-shrink-0">
          <Construction className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Coverage Improvements In Progress
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3 leading-relaxed">
            We&rsquo;re actively working to improve news coverage for the following country and category combinations. More sources and updates are coming soon.
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map(({ country, category }) => (
              <span
                key={`${country}-${category}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-300"
              >
                <span>{COUNTRY_FLAGS[country] || '🌍'}</span>
                <span>{COUNTRY_NAMES[country] || country.toUpperCase()}</span>
                <span className="text-amber-500 dark:text-amber-500">·</span>
                <span className="capitalize">{category}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
