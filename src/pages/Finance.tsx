import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Menu, TrendingUp, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from 'date-fns';
import { toast } from 'sonner';
import FinanceFilterSidebar from '@/components/finance/FinanceFilterSidebar';
import FinanceCard from '@/components/finance/FinanceCard';
import LoadingCard from '@/components/news/LoadingCard';
import FinanceEmptyState from '@/components/finance/FinanceEmptyState';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchFinanceNews } from '@/api/financeApi';

export default function Finance() {
  const [selectedMarkets, setSelectedMarkets] = useState(['stocks']);
  const [selectedSectors, setSelectedSectors] = useState(['tech']);
  const [selectedIndices, setSelectedIndices] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('week');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [articles, setArticles] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; details: string; retry: boolean } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [groupBy, setGroupBy] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    if (selectedMarkets.length === 0 || selectedSectors.length === 0) {
      setArticles([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFinanceNews({
        markets: selectedMarkets,
        sectors: selectedSectors,
        indices: selectedIndices,
        searchQuery,
        dateRange,
      });

      if (result?.articles) {
        setArticles(result.articles);
        setLastUpdated(new Date());

        const shouldGroup = selectedMarkets.length > 1 || selectedSectors.length > 1;
        if (shouldGroup && !groupBy) {
          setGroupBy(selectedMarkets.length > 1 ? 'market' : 'sector');
        }

        toast.success(`Loaded ${result.articles.length} finance articles`);
      } else {
        throw new Error('No articles returned');
      }
    } catch (err) {
      console.error('Failed to fetch finance news:', err);
      setError({
        message: 'Failed to load finance news',
        details: (err as Error).message,
        retry: true
      });
      toast.error('Unable to fetch finance news. Please try again.');
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMarkets, selectedSectors, selectedIndices, searchQuery, dateRange, groupBy]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchNews();
    }, searchQuery ? 500 : 0);

    return () => clearTimeout(timeoutId);
  }, [fetchNews, searchQuery]);

  const hasFilters = selectedMarkets.length > 0 && selectedSectors.length > 0;
  const isToday = selectedDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

  const dateRangeLabel = useMemo(() => ({
    '24h': 'Last 24 Hours',
    '3d': 'Last 3 Days',
    'week': 'This Week',
    'month': 'This Month',
    'all': 'All Time'
  } as Record<string, string>)[dateRange], [dateRange]);

  // Group articles by market or sector
  const groupedArticles = useMemo(() => {
    if (!groupBy || groupBy === 'none') return null;
    const groups: Record<string, unknown[]> = {};
    (articles as { market: string; sector: string }[]).forEach(article => {
      const key = groupBy === 'market' ? article.market : article.sector;
      if (!groups[key]) groups[key] = [];
      groups[key].push(article);
    });
    return groups;
  }, [articles, groupBy]);

  const MARKET_NAMES: Record<string, string> = {
    stocks: 'Stocks & Equities', crypto: 'Cryptocurrency', forex: 'Forex & Currencies',
    commodities: 'Commodities', bonds: 'Bonds & Fixed Income', realestate: 'Real Estate',
  };

  const SECTOR_NAMES: Record<string, string> = {
    tech: 'Technology', healthcare: 'Healthcare', energy: 'Energy',
    financial: 'Financial Services', consumer: 'Consumer Goods',
    industrial: 'Industrials', materials: 'Materials', utilities: 'Utilities',
  };

  return (
    <div className="flex h-full bg-stone-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-stone-200">
        <FinanceFilterSidebar
          selectedMarkets={selectedMarkets}
          setSelectedMarkets={setSelectedMarkets}
          selectedSectors={selectedSectors}
          setSelectedSectors={setSelectedSectors}
          selectedIndices={selectedIndices}
          setSelectedIndices={setSelectedIndices}
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
                  <FinanceFilterSidebar
                    selectedMarkets={selectedMarkets}
                    setSelectedMarkets={setSelectedMarkets}
                    selectedSectors={selectedSectors}
                    setSelectedSectors={setSelectedSectors}
                    selectedIndices={selectedIndices}
                    setSelectedIndices={setSelectedIndices}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                  />
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-xl lg:text-2xl font-bold text-stone-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  {isToday ? `Finance - ${dateRangeLabel}` : format(selectedDate, 'MMMM d, yyyy')}
                </h1>
                <p className="text-sm text-stone-500 hidden sm:block">
                  {hasFilters
                    ? `${articles.length} articles${searchQuery ? ` matching "${searchQuery}"` : ''}`
                    : 'Select filters to view finance news'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {isToday ? 'Today' : format(selectedDate, 'MMM d')}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date > new Date() || date < new Date('2024-01-01')}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {lastUpdated && (
                <span className="text-xs text-stone-400 hidden sm:inline">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}

              {(selectedMarkets.length > 1 || selectedSectors.length > 1) && articles.length > 0 && (
                <ToggleGroup type="single" value={groupBy || 'none'} onValueChange={setGroupBy}>
                  <ToggleGroupItem value="none" aria-label="No grouping" className="text-xs">
                    List
                  </ToggleGroupItem>
                  {selectedMarkets.length > 1 && (
                    <ToggleGroupItem value="market" aria-label="Group by market" className="text-xs">
                      By Market
                    </ToggleGroupItem>
                  )}
                  {selectedSectors.length > 1 && (
                    <ToggleGroupItem value="sector" aria-label="Group by sector" className="text-xs">
                      By Sector
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
                  {groupedArticles ? (
                    <div className="space-y-12">
                      {Object.entries(groupedArticles).map(([key, groupArts]) => (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <h2 className="text-2xl font-bold text-stone-900 mb-6 flex items-center gap-3">
                            <span className="w-1 h-8 bg-emerald-600 rounded-full" />
                            {groupBy === 'market' ? (MARKET_NAMES[key] || key) : (SECTOR_NAMES[key] || key)}
                            <span className="text-sm font-normal text-stone-400">
                              ({(groupArts as unknown[]).length} {(groupArts as unknown[]).length === 1 ? 'article' : 'articles'})
                            </span>
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {(groupArts as { title: string; source: string; image_url: string; market: string; sector: string; region: string; url: string; time_ago: string; views: number; summary_points: string[]; sentiment: 'bullish' | 'bearish' | 'neutral'; ticker?: string; price_change?: number }[]).map((article, index) => (
                              <FinanceCard key={index} article={article} index={index} rank={index + 1} />
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {(articles as { title: string; source: string; image_url: string; market: string; sector: string; region: string; url: string; time_ago: string; views: number; summary_points: string[]; sentiment: 'bullish' | 'bearish' | 'neutral'; ticker?: string; price_change?: number }[]).map((article, index) => (
                        <FinanceCard key={index} article={article} index={index} rank={index + 1} />
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <FinanceEmptyState hasFilters={hasFilters} />
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
