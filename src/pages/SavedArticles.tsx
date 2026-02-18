import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Trash2, Filter } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import NewsCard from '@/components/news/NewsCard';
import LoadingCard from '@/components/news/LoadingCard';
import AdUnit from '@/components/AdUnit';
import api from '@/api';
import { toast } from 'sonner';

export default function SavedArticles() {
  const [savedArticles, setSavedArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    loadSavedArticles();
  }, []);

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

  const filteredArticles = filterCategory === 'all' 
    ? savedArticles 
    : savedArticles.filter(a => a.category === filterCategory);

  const categories = ['all', ...new Set(savedArticles.map(a => a.category))];

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <Bookmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Saved Articles</h1>
              <p className="text-sm text-stone-500">
                {savedArticles.length} saved {savedArticles.length === 1 ? 'article' : 'articles'}
              </p>
            </div>
          </div>

          {savedArticles.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-stone-400" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-stone-200 text-sm bg-white"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Ad banner between header and content */}
      <div className="px-4 lg:px-8 pt-4">
        <AdUnit
          slot="REPLACE_WITH_SLOT_ID"
          format="horizontal"
          className="rounded-xl overflow-hidden bg-stone-100 min-h-[90px]"
        />
      </div>

      {/* Content */}
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
                <div key={article.id || index} className="relative">
                  <NewsCard article={article} index={index} rank={index + 1} />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 z-20"
                    onClick={() => handleDelete(article.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-stone-200 flex items-center justify-center mb-6">
                <Bookmark className="w-10 h-10 text-stone-400" />
              </div>
              <h3 className="text-xl font-semibold text-stone-800 mb-2">
                No saved articles yet
              </h3>
              <p className="text-stone-500 max-w-sm">
                Articles you bookmark will appear here for easy access later.
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
