import React from 'react';
import { Sparkles } from 'lucide-react';

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
  il: 'Israel', ae: 'UAE', sa: 'Saudi Arabia', tr: 'Turkey', qa: 'Qatar',
  kw: 'Kuwait', bh: 'Bahrain', om: 'Oman', jo: 'Jordan', lb: 'Lebanon',
  iq: 'Iraq', ir: 'Iran',
  za: 'South Africa', ng: 'Nigeria', eg: 'Egypt', ke: 'Kenya', ma: 'Morocco',
  gh: 'Ghana', et: 'Ethiopia', tz: 'Tanzania', ug: 'Uganda', sn: 'Senegal',
  ci: 'Ivory Coast', cm: 'Cameroon', dz: 'Algeria', tn: 'Tunisia', rw: 'Rwanda',
  au: 'Australia', nz: 'New Zealand', fj: 'Fiji', pg: 'Papua New Guinea',
  world: 'World',
};

const CATEGORY_NAMES: Record<string, string> = {
  'health-tech-science': 'Health, Tech & Science',
  business: 'Business',
  sports: 'Sports',
  entertainment: 'Entertainment',
  politics: 'Politics',
  world: 'World',
};

const DATE_RANGE_LABELS: Record<string, string> = {
  '24h': 'last 24 hours',
  '3d': 'last 3 days',
  'week': 'last week',
  'month': 'last month',
};

interface TrendingSummaryProps {
  digest: string | null | undefined;
  dateRange: string;
  selectedCountries: string[];
  selectedCategories: string[];
}

export default function TrendingSummary({
  digest,
  dateRange,
  selectedCountries,
  selectedCategories,
}: TrendingSummaryProps) {
  if (!digest) return null;

  const contextParts: string[] = [];
  if (selectedCountries.length === 1 && selectedCountries[0] !== 'world') {
    contextParts.push(COUNTRY_NAMES[selectedCountries[0]] ?? selectedCountries[0]);
  } else if (selectedCountries.length > 1) {
    contextParts.push('Multiple countries');
  }
  if (selectedCategories.length === 1) {
    contextParts.push(CATEGORY_NAMES[selectedCategories[0]] ?? selectedCategories[0]);
  } else if (selectedCategories.length > 1) {
    contextParts.push('Multiple categories');
  }
  const timeLabel = DATE_RANGE_LABELS[dateRange] ?? dateRange;
  contextParts.push(timeLabel);

  // Parse bullet lines: lines starting with • or - or *
  const bulletLines = digest
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[•\-\*]/.test(l))
    .map(l => {
      const text = l.replace(/^[•\-\*]\s*/, '');
      const sep = text.indexOf(' — ') !== -1 ? ' — ' : ' - ';
      const idx = text.indexOf(sep);
      if (idx === -1) return { title: text, facts: '' };
      return { title: text.slice(0, idx), facts: text.slice(idx + sep.length) };
    });

  const hasBullets = bulletLines.length > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
        <span className="text-xs font-semibold tracking-wide uppercase text-slate-400 dark:text-slate-500">
          AI Briefing
        </span>
        {contextParts.length > 0 && (
          <>
            <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {contextParts.join(' · ')}
            </span>
          </>
        )}
      </div>
      {hasBullets ? (
        <ul className="space-y-1.5">
          {bulletLines.map((b, i) => (
            <li key={i} className="text-sm text-stone-700 dark:text-slate-300 leading-relaxed flex gap-2">
              <span className="mt-0.5 text-slate-400 dark:text-slate-500 flex-shrink-0">•</span>
              <span>
                <strong className="font-semibold text-stone-800 dark:text-slate-200">{b.title}</strong>
                {b.facts && <> — {b.facts}</>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-700 dark:text-slate-300 leading-relaxed">{digest}</p>
      )}
    </div>
  );
}
