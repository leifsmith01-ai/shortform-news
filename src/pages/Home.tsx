import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Menu, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from 'sonner';
import FilterSidebar from '@/components/news/FilterSidebar';
import NewsCard from '@/components/news/NewsCard';
import LoadingCard from '@/components/news/LoadingCard';
import EmptyState from '@/components/news/EmptyState';
import GroupedArticles from '@/components/news/GroupedArticles';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import AdUnit from '@/components/AdUnit';
import api from '@/api';

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
  sports: 'Sports', entertainment: 'Entertainment', politics: 'Politics', world: 'World'
};

function getStoredList(key: string, fallback: string[]): string[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return fallback;
}

export default function Home() {
  const [selectedCountries, setSelectedCountries] = useState<string[]>(() =>
    getStoredList('selectedCountries', ['us'])
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    getStoredList('selectedCategories', ['technology'])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('week');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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

  const fetchNews = useCallback(async () => {
    if (selectedCountries.length === 0 || selectedCategories.length === 0) {
      setArticles([]);
      return;
    }

    setLoading(true);
    setError(null);

    const targetDate = new Date().toISOString().split('T')[0];
    
    try {
      // Try to get cached articles first
      const cachedArticles = [];
      
      for (const country of selectedCountries) {
        for (const category of selectedCategories) {
          const cached = await api.getCachedNews(targetDate, country, category);
          
          if (cached && cached.articles) {
            cachedArticles.push(...cached.articles);
          }
        }
      }

      // Only use cached articles if at least some already have AI summaries.
      // If none do, fall through to a fresh fetch so summaries get generated.
      const cachedHasSummaries = cachedArticles.some(
        a => a.summary_points && a.summary_points.length > 0
      );
      if (cachedArticles.length > 0 && cachedHasSummaries) {
        setArticles(cachedArticles);
        setLastUpdated(new Date());
        setLoading(false);

        const shouldGroup = selectedCountries.length > 1 || selectedCategories.length > 1;
        if (shouldGroup && !groupBy) {
          setGroupBy(selectedCountries.length > 1 ? 'country' : 'category');
        }
        return;
      }

      // Fetch fresh news
      const result = await api.fetchNews({
        countries: selectedCountries,
        categories: selectedCategories,
        searchQuery,
        dateRange
      });

      if (result?.articles) {
        const fetchedArticles = result.articles;
        setArticles(fetchedArticles);
        setLastUpdated(new Date());
        
        // Auto-detect grouping
        const shouldGroup = selectedCountries.length > 1 || selectedCategories.length > 1;
        if (shouldGroup && !groupBy) {
          setGroupBy(selectedCountries.length > 1 ? 'country' : 'category');
        }
        
        // Cache the results
        for (const country of selectedCountries) {
          for (const category of selectedCategories) {
            const relevantArticles = fetchedArticles.filter(
              a => a.country === country && a.category === category
            );
            
            if (relevantArticles.length > 0) {
              await api.cacheNews({
                fetch_date: targetDate,
                country: country,
                category: category,
                articles: relevantArticles
              });
            }
          }
        }
        
        toast.success(`Loaded ${fetchedArticles.length} articles`);
      } else {
        throw new Error('No articles returned from API');
      }
    } catch (error) {
      console.error('Failed to fetch news:', error);
      setError({
        message: 'Failed to load news articles',
        details: error.message,
        retry: true
      });
      toast.error('Unable to fetch news. Please try again.');
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCountries, selectedCategories, searchQuery, dateRange, groupBy]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchNews();
    }, searchQuery ? 500 : 0);

    return () => clearTimeout(timeoutId);
  }, [fetchNews, searchQuery]);

  const hasFilters = selectedCountries.length > 0 && selectedCategories.length > 0;

  const dateRangeLabel = useMemo(() => ({
    '24h': 'Last 24 Hours',
    '3d': 'Last 3 Days',
    'week': 'This Week',
    'month': 'This Month',
    'all': 'All Time'
  }[dateRange]), [dateRange]);

  return (
    <div className="flex h-full bg-stone-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-stone-200">
        <FilterSidebar
          selectedCountries={selectedCountries}
          setSelectedCountries={setSelectedCountries}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-stone-200 px-4 lg:px-8 py-4 flex-shrink-0">
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
                  />
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-xl lg:text-2xl font-bold text-stone-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-slate-900" />
                  {dateRangeLabel}
                </h1>
                <p className="text-sm text-stone-500 hidden sm:block">
                  {hasFilters 
                    ? `${articles.length} articles${searchQuery ? ` matching "${searchQuery}"` : ''}`
                    : 'Select filters to view news'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-stone-400 hidden sm:inline">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              
              {(selectedCountries.length > 1 || selectedCategories.length > 1) && articles.length > 0 && (
                <ToggleGroup type="single" value={groupBy || 'none'} onValueChange={setGroupBy}>
                  <ToggleGroupItem value="none" aria-label="No grouping" className="text-xs">
                    List
                  </ToggleGroupItem>
                  {selectedCountries.length > 1 && (
                    <ToggleGroupItem value="country" aria-label="Group by country" className="text-xs">
                      By Country
                    </ToggleGroupItem>
                  )}
                  {selectedCategories.length > 1 && (
                    <ToggleGroupItem value="category" aria-label="Group by category" className="text-xs">
                      By Category
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>
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
              {loading ? (
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
                                className="rounded-xl overflow-hidden bg-stone-100 min-h-[90px]"
                              />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
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
