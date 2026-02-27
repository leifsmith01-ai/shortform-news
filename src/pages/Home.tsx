import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Menu, Sparkles, AlertCircle } from 'lucide-react';
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
import LowCoverageTile from '@/components/news/LowCoverageTile';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import AdUnit from '@/components/AdUnit';
import api from '@/api';
import { sanitizeSearchQuery } from '@/lib/sanitize';

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

const CATEGORY_NAMES = {
  technology: 'Technology', business: 'Business', science: 'Science', health: 'Health',
  sports: 'Sports', gaming: 'Gaming', film: 'Film', tv: 'TV',
  politics: 'Politics', world: 'World'
};

// Migrate old "entertainment" category to the new subcategories
const CATEGORY_MIGRATIONS: Record<string, string[]> = {
  entertainment: ['gaming', 'film', 'tv'],
};

function getStoredList(key: string, fallback: string[]): string[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Apply migrations (e.g. entertainment → gaming, film, tv)
        if (key === 'selectedCategories') {
          const migrated = parsed.flatMap(v => CATEGORY_MIGRATIONS[v] ?? [v]);
          return [...new Set(migrated)];
        }
        return parsed;
      }
    }
  } catch {}
  return fallback;
}

export default function Home() {
  const { isSignedIn } = useUser();
  const [savedKeywords, setSavedKeywords] = useState<string[]>([]);

  // Fetch saved keywords for autocomplete suggestions in the search box.
  // This is non-critical — failure is silently ignored.
  useEffect(() => {
    if (!isSignedIn) { setSavedKeywords([]); return; }
    api.getKeywords()
      .then(kws => setSavedKeywords(kws.map((k: { keyword: string }) => k.keyword)))
      .catch(() => {});
  }, [isSignedIn]);

  const [selectedCountries, setSelectedCountries] = useState<string[]>(() =>
    getStoredList('selectedCountries', ['us'])
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    getStoredList('selectedCategories', ['technology'])
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(() =>
    getStoredList('selectedSources', [])
  );
  const [showNonEnglish, setShowNonEnglish] = useState<boolean>(() =>
    localStorage.getItem('showNonEnglish') === 'true'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('24h');
  const [articles, setArticles] = useState([]);
  const [lowCoverage, setLowCoverage] = useState<{country: string; category: string; count: number}[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Stale-while-revalidate: keeps the last successful fetch visible while a new one runs.
  const [hasStaleData, setHasStaleData] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [groupBy, setGroupBy] = useState(null);

  // Persist filter selections across refreshes
  useEffect(() => {
    localStorage.setItem('selectedCountries', JSON.stringify(selectedCountries));
  }, [selectedCountries]);

  useEffect(() => {
    localStorage.setItem('selectedCategories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  useEffect(() => {
    localStorage.setItem('selectedSources', JSON.stringify(selectedSources));
  }, [selectedSources]);

  useEffect(() => {
    localStorage.setItem('showNonEnglish', String(showNonEnglish));
  }, [showNonEnglish]);

  // Ref for aborting in-flight requests when filters change
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchNews = useCallback(async () => {
    if (selectedCountries.length === 0 || selectedCategories.length === 0) {
      setArticles([]);
      return;
    }

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await api.fetchNews({
        countries: selectedCountries,
        categories: selectedCategories,
        searchQuery: searchQuery ? sanitizeSearchQuery(searchQuery) : undefined,
        dateRange,
        sources: selectedSources.length > 0 ? selectedSources : undefined,
        language: showNonEnglish ? 'all' : 'en',
      });

      // If this request was aborted while in flight, discard the result
      if (controller.signal.aborted) return;

      if (result?.articles) {
        const fetchedArticles = result.articles;
        setArticles(fetchedArticles);
        setHasStaleData(true);
        setLowCoverage(result.lowCoverage || []);
        setLastUpdated(new Date());

        // Auto-detect grouping (reads groupBy via closure but doesn't depend on it)
        const shouldGroup = selectedCountries.length > 1 || selectedCategories.length > 1;
        setGroupBy(prev => {
          if (shouldGroup && !prev) {
            return selectedCountries.length > 1 ? 'country' : 'category';
          }
          return prev;
        });

        const rangeLabel = {
          '24h': 'Last 24 hours', '3d': 'Last 3 days',
          'week': 'This week', 'month': 'This month', 'all': 'All time',
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
      // Don't show errors for intentionally aborted requests
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      console.error('Failed to fetch news:', error);
      setError({
        message: 'Failed to load news articles',
        details: error.message,
        retry: true
      });
      toast.error('Unable to fetch news. Please try again.');
      // Keep stale articles visible — don't wipe the screen on a failed refresh
    } finally {
      // Only clear loading if this is still the active request
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [selectedCountries, selectedCategories, selectedSources, searchQuery, dateRange, showNonEnglish]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchNews();
    }, searchQuery ? 500 : 0);

    return () => clearTimeout(timeoutId);
  }, [fetchNews]);

  const hasFilters = selectedCountries.length > 0 && selectedCategories.length > 0;

  const dateRangeLabel = useMemo(() => ({
    '24h': 'Last 24 Hours',
    '3d': 'Last 3 Days',
    'week': 'This Week',
    'month': 'This Month',
    'all': 'All Time'
  }[dateRange]), [dateRange]);

  return (
    <div className="flex h-full bg-stone-50 dark:bg-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-stone-200 dark:border-slate-700">
        <FilterSidebar
          selectedCountries={selectedCountries}
          setSelectedCountries={setSelectedCountries}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          dateRange={dateRange}
          setDateRange={setDateRange}
          selectedSources={selectedSources}
          setSelectedSources={setSelectedSources}
          showNonEnglish={showNonEnglish}
          setShowNonEnglish={setShowNonEnglish}
          savedKeywords={savedKeywords}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Mobile Menu */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
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
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    showNonEnglish={showNonEnglish}
                    setShowNonEnglish={setShowNonEnglish}
                    savedKeywords={savedKeywords}
                  />
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-xl lg:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-slate-900 dark:text-slate-200" />
                  {dateRangeLabel}
                </h1>
                <p className="text-sm text-stone-500 dark:text-slate-400 hidden sm:block">
                  {hasFilters 
                    ? `${articles.length} articles${searchQuery ? ` matching "${searchQuery}"` : ''}`
                    : 'Select filters to view news'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-stone-400 dark:text-slate-500 hidden sm:inline">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              
              {(selectedCountries.length > 1 || selectedCategories.length > 1) && articles.length > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] text-stone-400 uppercase tracking-wider hidden sm:block">Group by</span>
                  <ToggleGroup type="single" value={groupBy || 'none'} onValueChange={setGroupBy}>
                    <ToggleGroupItem value="none" aria-label="Flat list — all articles in one stream" title="Flat list — all articles in one stream" className="text-xs">
                      Flat list
                    </ToggleGroupItem>
                    {selectedCountries.length > 1 && (
                      <ToggleGroupItem value="country" aria-label="Group articles by country" title="Group articles by country" className="text-xs">
                        Country
                      </ToggleGroupItem>
                    )}
                    {selectedCategories.length > 1 && (
                      <ToggleGroupItem value="category" aria-label="Group articles by category" title="Group articles by category" className="text-xs">
                        Category
                      </ToggleGroupItem>
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

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-4 lg:px-8 py-3">
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

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="p-4 lg:p-8">
            <AnimatePresence mode="wait">
              {loading && !hasStaleData ? (
                // First-ever load — no previous data to show, render skeletons
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                >
                  {[...Array(6)].map((_, i) => (
                    <LoadingCard key={i} />
                  ))}
                </motion.div>
              ) : articles.length > 0 ? (
                <motion.div
                  key="articles"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-slate-500 mb-4">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Refreshing…</span>
                    </div>
                  )}
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
                          <NewsCard article={article} index={index} rank={index + 1} />
                          {/* Ad after every 6th article */}
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
                      {/* Low coverage notification — shown after articles */}
                      {lowCoverage.length > 0 && (
                        <LowCoverageTile items={lowCoverage} index={articles.length} />
                      )}
                    </div>
                  )}
                </motion.div>
              ) : (
                <EmptyState hasFilters={hasFilters} />
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
