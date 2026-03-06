import React, { useState, useMemo } from 'react';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { Article } from '@/types/article';

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
  '24h': 'the last 24 hours',
  '3d': 'the last 3 days',
  'week': 'the last week',
  'month': 'the last month',
};

interface TrendingSummaryProps {
  articles: Article[];
  dateRange: string;
  selectedCountries: string[];
  selectedCategories: string[];
}

export default function TrendingSummary({
  articles,
  dateRange,
  selectedCountries,
  selectedCategories,
}: TrendingSummaryProps) {
  const [collapsed, setCollapsed] = useState(false);

  const topArticles = useMemo(() => {
    // Sort multi-source articles by coverage count descending
    const multiSource = articles
      .filter(a => a._coverage && a._coverage.count >= 2)
      .sort((a, b) => (b._coverage!.count) - (a._coverage!.count));

    if (multiSource.length === 0) return [];

    // Take top 3; pad from the main list if needed (without duplicates)
    const top = multiSource.slice(0, 3);
    if (top.length < 3) {
      const topUrls = new Set(top.map(a => a.url));
      for (const a of articles) {
        if (top.length >= 3) break;
        if (!topUrls.has(a.url)) {
          top.push(a);
          topUrls.add(a.url);
        }
      }
    }
    return top;
  }, [articles]);

  const contextLabel = useMemo(() => {
    const country = selectedCountries.length === 1
      ? (COUNTRY_NAMES[selectedCountries[0]] ?? selectedCountries[0])
      : selectedCountries.length > 1
        ? 'multiple countries'
        : '';
    const category = selectedCategories.length === 1
      ? (CATEGORY_NAMES[selectedCategories[0]] ?? selectedCategories[0])
      : selectedCategories.length > 1
        ? 'multiple categories'
        : '';
    if (country && category) return `${country} — ${category}`;
    return country || category || 'your selected filters';
  }, [selectedCountries, selectedCategories]);

  const timeLabel = DATE_RANGE_LABELS[dateRange] ?? dateRange;

  if (topArticles.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-stone-50 dark:hover:bg-slate-700/50 transition-colors"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2.5">
          <TrendingUp className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-slate-200">
            Top stories in {contextLabel} over {timeLabel}
          </span>
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-stone-400 dark:text-slate-500 flex-shrink-0" />
          : <ChevronUp className="w-4 h-4 text-stone-400 dark:text-slate-500 flex-shrink-0" />
        }
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="divide-y divide-stone-100 dark:divide-slate-700">
          {topArticles.map((article, i) => {
            const bullets = article.summary_points?.slice(0, 2) ?? [];
            const hasBullets = bullets.length > 0;
            return (
              <div key={article.url ?? i} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-stone-900 dark:text-slate-100 hover:underline leading-snug"
                  >
                    {article.title}
                  </a>
                  {article._coverage && (
                    <span className="flex-shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-stone-100 dark:bg-slate-700 rounded-full px-2 py-0.5 whitespace-nowrap">
                      {article._coverage.count} sources
                    </span>
                  )}
                </div>
                {hasBullets ? (
                  <ul className="space-y-1">
                    {bullets.map((point, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-stone-600 dark:text-slate-400">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 flex-shrink-0" />
                        <span>{point.replace(/^[•\-–]\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                ) : article.description ? (
                  <p className="text-xs text-stone-500 dark:text-slate-400 line-clamp-2">{article.description}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
