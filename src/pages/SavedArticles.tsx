import React, { useContext, useState, useEffect } from 'react';
import { Bookmark, Trash2, Filter, Lock, LogIn } from 'lucide-react';
import { ApiReadyContext } from '@/App';
import { useCountUp } from '@/hooks/useCountUp';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import NewsCard from '@/components/news/NewsCard';
import LoadingCard from '@/components/news/LoadingCard';
import AdUnit from '@/components/AdUnit';
import api from '@/api';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';

export default function SavedArticles() {
  const apiReady = useContext(ApiReadyContext);
  const { isSignedIn, isLoaded } = useUser();
  const [savedArticles, setSavedArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    if (!apiReady || !isSignedIn) {
      setLoading(false);
      return;
    }
    loadSavedArticles();
  }, [apiReady, isSignedIn]);

  const loadSavedArticles = async () => {
    setLoading(true);
    try {
      const articles = await api.getSavedArticles();
      setSavedArticles(articles);
    } catch (error) {
      toast.error('Failed to load saved articles');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (articleId) => {
    try {
      await api.unsaveArticle(articleId);
      setSavedArticles(prev => prev.filter(a => a.id !== articleId));
      toast.success('Article removed');
    } catch (error) {
      toast.error('Failed to remove article');
    }
  };

  const animatedCount = useCountUp(savedArticles.length);

  const filteredArticles = filterCategory === 'all'
    ? savedArticles 
    : savedArticles.filter(a => a.category === filterCategory);

  const categories = ['all', ...new Set(savedArticles.map(a => a.category))];

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
              <Bookmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Saved Articles</h1>
              <p className="text-sm text-stone-500 dark:text-slate-400">
                {isLoaded && isSignedIn
                  ? `${animatedCount} saved ${savedArticles.length === 1 ? 'article' : 'articles'}`
                  : 'Sign in to view your saved articles'}
              </p>
            </div>
          </div>

          {isSignedIn && savedArticles.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-stone-400" />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      {/* Ad banner between header and content */}
      <div className="px-4 lg:px-8 pt-4">
        <AdUnit
          slot="2844757664"
          format="horizontal"
          className="rounded-xl overflow-hidden bg-stone-100 min-h-[90px]"
        />
      </div>

      {/* Body */}
      {isLoaded && !isSignedIn ? (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Login suggestion sidebar */}
          <aside className="w-full lg:w-72 flex-shrink-0 bg-white dark:bg-slate-800 border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-slate-700 flex flex-col">
            <div className="p-4 flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-slate-700 flex items-center justify-center mb-3 hidden lg:flex">
                <Lock className="w-5 h-5 text-stone-400 dark:text-slate-500" />
              </div>
              <p className="text-sm text-stone-500 dark:text-slate-400 font-medium mb-1">Sign in to get started</p>
              <p className="text-xs text-stone-400 dark:text-slate-500 mb-4 hidden lg:block">Save articles to revisit them anytime.</p>
              <Link to="/sign-in">
                <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white gap-2 h-8 text-xs">
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </Button>
              </Link>
            </div>
          </aside>

          {/* Empty state */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 min-h-[400px]">
            <div className="w-20 h-20 rounded-2xl bg-stone-200 dark:bg-slate-700 flex items-center justify-center mb-6">
              <Bookmark className="w-10 h-10 text-stone-400 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
              No saved articles yet
            </h3>
            <p className="text-stone-500 dark:text-slate-400 max-w-sm">
              Articles you bookmark will appear here for easy access later.
            </p>
          </div>
        </div>
      ) : (
        /* Content for signed-in users */
        <ScrollArea className="flex-1">
          <div className="p-4 lg:p-8">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <LoadingCard key={i} />
                ))}
              </div>
            ) : filteredArticles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredArticles.map((article, index) => (
                  <div key={article.id || index} className="flex flex-col gap-1">
                    <NewsCard article={article} index={index} rank={index + 1} />
                    <div className="flex justify-end px-1">
                      <button
                        onClick={() => handleDelete(article.id)}
                        className="flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors py-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                <div className="w-20 h-20 rounded-2xl bg-stone-200 dark:bg-slate-700 flex items-center justify-center mb-6">
                  <Bookmark className="w-10 h-10 text-stone-400 dark:text-slate-500" />
                </div>
                <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
                  No saved articles yet
                </h3>
                <p className="text-stone-500 dark:text-slate-400 max-w-sm">
                  Articles you bookmark will appear here for easy access later.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
