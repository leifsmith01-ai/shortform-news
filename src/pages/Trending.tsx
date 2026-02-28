import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Flame, AlertCircle, TrendingUp } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from 'sonner';
import NewsCard from '@/components/news/NewsCard';
import LoadingCard from '@/components/news/LoadingCard';
import api from '@/api';

const CATEGORY_COLORS: Record<string, string> = {
  'health-tech-science': 'bg-blue-100 text-blue-700',
  business: 'bg-green-100 text-green-700',
  sports: 'bg-orange-100 text-orange-700',
  entertainment: 'bg-pink-100 text-pink-700',
  politics: 'bg-amber-100 text-amber-700',
  world: 'bg-teal-100 text-teal-700',
};

export default function Trending() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hasStaleData, setHasStaleData] = useState(false);

  const fetchTrending = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/trending', { method: 'GET' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Server error: ${response.status}`);
      }
      const result = await response.json();

      if (result?.articles) {
        setArticles(result.articles);
        setHasStaleData(true);
        setLastUpdated(new Date());
        toast.success(`Loaded ${result.articles.length} trending articles`);
      } else {
        throw new Error('No articles returned');
      }
    } catch (err) {
      console.error('Failed to fetch trending:', err);
      setError({
        message: 'Failed to load trending articles',
        details: err.message,
      });
      toast.error('Unable to fetch trending news. Please try again.');
      // Keep stale articles visible on error — don't wipe the screen on a failed refresh
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, []);

  return (
    <div className="flex h-full bg-stone-50 dark:bg-slate-900 flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              Trending Now
            </h1>
            <p className="text-sm text-stone-500 dark:text-slate-400 hidden sm:block">
              {articles.length > 0
                ? `Top ${articles.length} most popular articles across all categories`
                : 'Top articles trending across all categories'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-stone-400 dark:text-slate-500 hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTrending}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800">{error.message}</h3>
              <p className="text-xs text-red-600 mt-0.5">{error.details}</p>
            </div>
            <Button
              onClick={fetchTrending}
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
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
                style={{ touchAction: 'pan-y' }}
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
                style={{ touchAction: 'pan-y' }}
              >
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-slate-500 mb-4">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Refreshing…</span>
                  </div>
                )}
                {/* Top 3 highlight */}
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-semibold text-stone-600 dark:text-slate-400 uppercase tracking-wide">
                    Top Stories Right Now
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {articles.map((article, index) => (
                    <div key={index} className="relative">
                      {/* Rank badge */}
                      <div className={`absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${
                        index === 0
                          ? 'bg-yellow-400 text-yellow-900'
                          : index === 1
                          ? 'bg-slate-300 text-slate-700'
                          : index === 2
                          ? 'bg-amber-600 text-white'
                          : 'bg-stone-200 dark:bg-slate-700 text-stone-600 dark:text-slate-300'
                      }`}>
                        {index + 1}
                      </div>
                      <NewsCard article={article} index={index} rank={index + 1} isPriority={index < 3} />
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : !loading && !error ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ touchAction: 'pan-y' }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <Flame className="w-12 h-12 text-stone-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-stone-500 dark:text-slate-400 mb-2">No trending articles</h3>
                <p className="text-stone-400 dark:text-slate-500 text-sm mb-6">
                  Could not load trending articles at the moment.
                </p>
                <Button onClick={fetchTrending} variant="outline">
                  Try Again
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
