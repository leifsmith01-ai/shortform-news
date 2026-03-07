import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import SEO from '@/components/SEO';
import { RefreshCw, Menu, Sparkles, AlertCircle, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import FilterSidebar from '@/components/news/FilterSidebar';
import NewsCard from '@/components/news/NewsCard';
import LoadingCard from '@/components/news/LoadingCard';
import EmptyState from '@/components/news/EmptyState';
import GroupedArticles from '@/components/news/GroupedArticles';
import TrendingSummary from '@/components/news/TrendingSummary';
import LowCoverageTile from '@/components/news/LowCoverageTile';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import AdUnit from '@/components/AdUnit';
import api from '@/api';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { mergeAndRank, getCachedArticles, hasFreshCache } from '@/lib/articleCache';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

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
  // Special
  world: 'World',
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
  il: '🇮🇱', ae: '🇦🇪', sa: '🇸🇦', tr: '🇹🇷', qa: '🇶🇦',
  kw: '🇰🇼', bh: '🇧🇭', om: '🇴🇲', jo: '🇯🇴', lb: '🇱🇧',
  iq: '🇮🇶', ir: '🇮🇷',
  za: '🇿🇦', ng: '🇳🇬', eg: '🇪🇬', ke: '🇰🇪', ma: '🇲🇦',
  gh: '🇬🇭', et: '🇪🇹', tz: '🇹🇿', ug: '🇺🇬', sn: '🇸🇳',
  ci: '🇨🇮', cm: '🇨🇲', dz: '🇩🇿', tn: '🇹🇳', rw: '🇷🇼',
  au: '🇦🇺', nz: '🇳🇿', fj: '🇫🇯', pg: '🇵🇬', world: '🌍',
};

// Short display names for filter chips (avoid long strings on small screens)
const SHORT_CATEGORY_NAMES: Record<string, string> = {
  all: 'All',
  'health-tech-science': 'Health & Tech',
  business: 'Business',
  sports: 'Sports',
  entertainment: 'Entertainment',
  politics: 'Politics',
  world: 'World',
};

const CATEGORY_NAMES = {
  all: 'All',
  'health-tech-science': 'Health, Tech and Science',
  business: 'Business',
  sports: 'Sports',
  entertainment: 'Entertainment',
  politics: 'Politics',
  world: 'World',
};

// Migrate old subcategories to the new combined categories
const CATEGORY_MIGRATIONS: Record<string, string[]> = {
  technology: ['health-tech-science'],
  science: ['health-tech-science'],
  health: ['health-tech-science'],
  gaming: ['entertainment'],
  film: ['entertainment'],
  tv: ['entertainment'],
  music: ['entertainment'],
};

function getStoredList(key: string, fallback: string[]): string[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (key === 'selectedCategories') {
          const migrated = parsed.flatMap(v => CATEGORY_MIGRATIONS[v] ?? [v]);
          return [...new Set(migrated)];
        }
        return parsed;
      }
    }
  } catch { }
  return fallback;
}

export default function Home() {
  const { isSignedIn } = useUser();
  const [savedKeywords, setSavedKeywords] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSignedIn) { setSavedKeywords([]); return; }
    api.getKeywords()
      .then(kws => setSavedKeywords(kws.map((k: { keyword: string }) => k.keyword)))
      .catch(() => { });
  }, [isSignedIn]);

  const [selectedCountries, setSelectedCountries] = useState<string[]>(() =>
    getStoredList('selectedCountries', ['us'])
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    getStoredList('selectedCategories', ['health-tech-science'])
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(() =>
    getStoredList('selectedSources', [])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('24h');
  const [articles, setArticles] = useState(() => {
    if (!hasFreshCache()) return [];
    return getCachedArticles({
      countries: getStoredList('selectedCountries', ['us']),
      categories: getStoredList('selectedCategories', ['health-tech-science']),
      dateRange: '24h',
    });
  });
  const [lowCoverage, setLowCoverage] = useState<{ country: string; category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasStaleData, setHasStaleData] = useState(() => hasFreshCache());
  const [digest, setDigest] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [groupBy, setGroupBy] = useState(null);

  useEffect(() => {
    localStorage.setItem('selectedCountries', JSON.stringify(selectedCountries));
  }, [selectedCountries]);

  useEffect(() => {
    localStorage.setItem('selectedCategories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  useEffect(() => {
    localStorage.setItem('selectedSources', JSON.stringify(selectedSources));
  }, [selectedSources]);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchNews = useCallback(async () => {
    if (selectedCountries.length === 0 || selectedCategories.length === 0) {
      setArticles([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setDigest(null);

    try {
      const ENGLISH_PRIMARY = new Set(['us', 'gb', 'au', 'ca', 'nz', 'ie']);
      const language = selectedCountries.every(c => ENGLISH_PRIMARY.has(c)) ? 'en' : 'all';

      const result = await api.fetchNews({
        countries: selectedCountries,
        categories: selectedCategories,
        searchQuery: searchQuery ? sanitizeSearchQuery(searchQuery) : undefined,
        dateRange,
        sources: selectedSources.length > 0 ? selectedSources : undefined,
        language,
      });

      if (controller.signal.aborted) return;

      if (result?.articles) {
        const fetchedArticles = result.articles;
        const merged = mergeAndRank(fetchedArticles, {
          countries: selectedCountries,
          categories: selectedCategories,
          dateRange,
          searchQuery: searchQuery ? sanitizeSearchQuery(searchQuery) : undefined,
        });
        setArticles(merged);
        setHasStaleData(true);
        setDigest(result.digest ?? null);
        setLowCoverage(result.lowCoverage || []);
        setLastUpdated(new Date());

        const shouldGroup = selectedCountries.length > 1 || selectedCategories.length > 1;
        setGroupBy(prev => {
          if (shouldGroup && !prev) {
            return selectedCountries.length > 1 ? 'country' : 'category';
          }
          return prev;
        });

        const rangeLabel = {
          '24h': 'Last 24 hours', '3d': 'Last 3 days',
          'week': 'This week', 'month': 'This month',
        }[dateRange] ?? 'News';
        toast.custom(() => (
          <div className="flex items-center gap-3 bg-slate-900 text-white pl-4 pr-3 py-3 rounded-xl shadow-xl border border-slate-700 w-72">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">
                {fetchedArticles.length} article{fetchedArticles.length !== 1 ? 's' : ''} loaded
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{rangeLabel}</p>
            </div>
          </div>
        ), { duration: 3000 });
      } else {
        throw new Error('No articles returned from API');
      }
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      console.error('Failed to fetch news:', error);
      setError({
        message: 'Failed to load news articles',
        details: error.message,
        retry: true
      });
      toast.error('Unable to fetch news. Please try again.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [selectedCountries, selectedCategories, selectedSources, searchQuery, dateRange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchNews();
    }, searchQuery ? 500 : 0);

    return () => clearTimeout(timeoutId);
  }, [fetchNews]);

  // Pull-to-refresh — attached to the scroll container wrapper
  const { isPulling, pullProgress } = usePullToRefresh(fetchNews, scrollContainerRef);

  const hasFilters = selectedCountries.length > 0 && selectedCategories.length > 0;

  const dateRangeLabel = useMemo(() => ({
    '24h': 'Last 24 Hours',
    '3d': 'Last 3 Days',
    'week': 'This Week',
    'month': 'This Month',
  }[dateRange]), [dateRange]);

  const itemListSchema = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Latest News in Brief',
    itemListElement: articles.slice(0, 10).map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: a.url,
      name: a.title,
    })),
  }), [articles]);

  return (
    <div className="flex flex-col lg:flex-row h-full bg-stone-50 dark:bg-slate-900">
      <SEO
        title="Latest News in Brief"
        description="Get the latest breaking news in short-form summaries. AI-powered headlines from trusted sources worldwide, updated every hour."
        canonical="/"
      />
      {articles.length > 0 && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
        </Helmet>
      )}

      {/* Desktop Filter Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-stone-200 dark:border-slate-700">
        <FilterSidebar
          selectedCountries={selectedCountries}
          setSelectedCountries={setSelectedCountries}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedSources={selectedSources}
          setSelectedSources={setSelectedSources}
          savedKeywords={savedKeywords}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col">

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            {/* Left: mobile filter drawer trigger + page title */}
            <div className="flex items-center gap-3 min-w-0">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden flex-shrink-0">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72">
                  <FilterSidebar
                    selectedCountries={selectedCountries}
                    setSelectedCountries={setSelectedCountries}
                    selectedCategories={selectedCategories}
                    setSelectedCategories={setSelectedCategories}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    savedKeywords={savedKeywords}
                  />
                </SheetContent>
              </Sheet>

              <div className="min-w-0">
                <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 truncate">
                  <Sparkles className="w-5 h-5 text-slate-900 dark:text-slate-200 flex-shrink-0" />
                  {dateRangeLabel}
                </h1>
                <p className="text-xs text-stone-500 dark:text-slate-400 hidden sm:block mt-0.5">
                  {hasFilters
                    ? `${articles.length} articles${searchQuery ? ` matching "${searchQuery}"` : ''}`
                    : 'Select filters to view news'
                  }
                </p>
              </div>
            </div>

            {/* Right: desktop date range pills + group by + refresh */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {lastUpdated && (
                <span className="text-xs text-stone-400 dark:text-slate-500 hidden md:inline">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}

              {/* Date range — desktop only in the header row */}
              <div className="hidden lg:flex items-center gap-1">
                {(['24h', '3d', 'week', 'month'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-2.5 py-1.5 text-xs rounded-full font-medium transition-colors ${dateRange === range
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400 hover:bg-stone-200 dark:hover:bg-slate-600'
                      }`}
                  >
                    {range === '24h' ? '24h' : range === '3d' ? '3 days' : range === 'week' ? '1 week' : '1 month'}
                  </button>
                ))}
              </div>

              {/* Group by — desktop only */}
              {(selectedCountries.length > 1 || selectedCategories.length > 1) && articles.length > 0 && (
                <div className="hidden lg:flex flex-col items-end gap-1">
                  <span className="text-xs text-stone-400 uppercase tracking-wider">Group by</span>
                  <ToggleGroup type="single" value={groupBy || 'none'} onValueChange={setGroupBy}>
                    <ToggleGroupItem value="none" className="text-xs">Flat</ToggleGroupItem>
                    {selectedCountries.length > 1 && (
                      <ToggleGroupItem value="country" className="text-xs">Country</ToggleGroupItem>
                    )}
                    {selectedCategories.length > 1 && (
                      <ToggleGroupItem value="category" className="text-xs">Category</ToggleGroupItem>
                    )}
                  </ToggleGroup>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={fetchNews}
                disabled={loading || !hasFilters}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </header>

        {/* ── Mobile sub-bar: date range + group by (lg: hidden) ─────── */}
        <div className="lg:hidden bg-white dark:bg-slate-800 border-b border-stone-100 dark:border-slate-700/60 px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-1">
            {(['24h', '3d', 'week', 'month'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`flex-1 py-1.5 text-xs rounded-full font-medium transition-colors text-center ${dateRange === range
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-stone-100 dark:bg-slate-700 text-stone-600 dark:text-slate-400'
                  }`}
              >
                {range === '24h' ? '24h' : range === '3d' ? '3d' : range === 'week' ? '1w' : '1m'}
              </button>
            ))}
          </div>

          {/* Mobile group by */}
          {(selectedCountries.length > 1 || selectedCategories.length > 1) && articles.length > 0 && (
            <ToggleGroup type="single" value={groupBy || 'none'} onValueChange={setGroupBy} className="ml-2">
              <ToggleGroupItem value="none" aria-label="Flat list" title="Flat list" className="text-xs px-2">Flat</ToggleGroupItem>
              {selectedCountries.length > 1 && (
                <ToggleGroupItem value="country" aria-label="Group by country" title="Group by country" className="text-xs px-2">Country</ToggleGroupItem>
              )}
              {selectedCategories.length > 1 && (
                <ToggleGroupItem value="category" aria-label="Group by category" title="Group by category" className="text-xs px-2">Category</ToggleGroupItem>
              )}
            </ToggleGroup>
          )}
        </div>

        {/* ── Mobile filter chips (active filters as removable pills) ── */}
        {(selectedCountries.length > 0 || selectedCategories.length > 0) && (
          <div className="lg:hidden flex items-center gap-2 px-4 py-2 bg-stone-50 dark:bg-slate-900 border-b border-stone-100 dark:border-slate-700/60 overflow-x-auto scrollbar-none flex-shrink-0">
            {selectedCountries.map(code => (
              <button
                key={code}
                onClick={() => setSelectedCountries(prev => prev.filter(c => c !== code))}
                className="flex-shrink-0 flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium"
              >
                <span>{COUNTRY_FLAGS[code] || '🌍'}</span>
                <span className="max-w-[80px] truncate">{code.toUpperCase()}</span>
                <X className="w-3 h-3 opacity-60 ml-0.5" />
              </button>
            ))}
            {selectedCategories.filter(c => c !== 'all').map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategories(prev => prev.filter(c => c !== cat))}
                className="flex-shrink-0 flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-stone-200 dark:bg-slate-700 text-stone-700 dark:text-slate-300 text-xs font-medium"
              >
                <span className="max-w-[90px] truncate">{SHORT_CATEGORY_NAMES[cat] || cat}</span>
                <X className="w-3 h-3 opacity-60 ml-0.5" />
              </button>
            ))}
          </div>
        )}

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-4 lg:px-8 py-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800">{error.message}</h3>
                <p className="text-xs text-red-600 mt-0.5">{error.details}</p>
              </div>
              {error.retry && (
                <Button onClick={fetchNews} size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                  Try Again
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Scroll container with pull-to-refresh ────────────────────── */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 relative">
          {/* Pull-to-refresh indicator */}
          {isPulling && (
            <div
              className="absolute top-0 inset-x-0 flex items-center justify-center z-10 pointer-events-none"
              style={{ height: `${48 * pullProgress}px`, overflow: 'hidden' }}
            >
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
                <RefreshCw
                  className="w-4 h-4 transition-transform"
                  style={{ transform: `rotate(${pullProgress * 360}deg)` }}
                />
                <span>{pullProgress >= 1 ? 'Release to refresh' : 'Pull to refresh'}</span>
              </div>
            </div>
          )}

          <ScrollArea className="h-full">
            <div className="p-4 lg:p-8">
              {loading && !hasStaleData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <LoadingCard key={i} index={i} />
                  ))}
                </div>
              ) : articles.length > 0 ? (
                <div>
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-slate-500 mb-4">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Refreshing…</span>
                    </div>
                  )}
                  <TrendingSummary
                    digest={digest}
                    dateRange={dateRange}
                    selectedCountries={selectedCountries}
                    selectedCategories={selectedCategories}
                  />
                  {groupBy && groupBy !== 'none' ? (
                    <GroupedArticles
                      articles={articles}
                      groupBy={groupBy}
                      selectedKeys={groupBy === 'country' ? selectedCountries : selectedCategories}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {articles.map((article, index) => (
                        <React.Fragment key={index}>
                          <NewsCard article={article} index={index} rank={index + 1} isPriority={index < 3} />
                          {(index + 1) % 6 === 0 && (
                            <div className="col-span-full">
                              <AdUnit
                                slot="2844757664"
                                format="horizontal"
                                className="rounded-xl overflow-hidden bg-stone-100 dark:bg-slate-800 min-h-[90px]"
                              />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                      {lowCoverage.length > 0 && (
                        <LowCoverageTile items={lowCoverage} index={articles.length} />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState hasFilters={hasFilters} />
              )}
            </div>
          </ScrollArea>
        </div>

      </main>
    </div>
  );
}
