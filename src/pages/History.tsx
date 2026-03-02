import React, { useContext, useState, useEffect } from 'react';
import { Clock, Calendar, Trash2, Lock, LogIn } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { format } from 'date-fns';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import api from '@/api';
import { toast } from 'sonner';
import { ApiReadyContext } from '@/App';
import { useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';

export default function History() {
  const apiReady = useContext(ApiReadyContext);
  const { isSignedIn, isLoaded } = useUser();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Wait until UserInitialiser has set the JWT in the Supabase client AND called
  // api.setUser() — only then will RLS policies pass and return the user's rows.
  useEffect(() => {
    if (!apiReady || !isSignedIn) {
      setLoading(false);
      return;
    }
    loadHistory();
  }, [apiReady, isSignedIn]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await api.getReadingHistory();
      setHistory(data);
    } catch (error) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const groupByDate = (items) => {
    const grouped = {};
    items.forEach(item => {
      const d = item.read_date ? new Date(item.read_date) : new Date();
      const date = isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(item);
    });
    return grouped;
  };

  const groupedHistory = groupByDate(history);
  const animatedCount = useCountUp(history.length);

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 px-4 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Reading History</h1>
              <p className="text-sm text-stone-500 dark:text-slate-400">
                {isLoaded && isSignedIn
                  ? `${animatedCount} article${history.length !== 1 ? 's' : ''} read`
                  : 'Sign in to view your reading history'}
              </p>
            </div>
          </div>
        </div>
      </header>

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
              <p className="text-xs text-stone-400 dark:text-slate-500 mb-4 hidden lg:block">Track the articles you've read over time.</p>
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
              <Clock className="w-10 h-10 text-stone-400 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
              No reading history yet
            </h3>
            <p className="text-stone-500 dark:text-slate-400 max-w-sm">
              Start reading articles and they'll appear here in your history.
            </p>
          </div>
        </div>
      ) : (
        /* Content for signed-in users */
        <ScrollArea className="flex-1">
          <div className="p-4 lg:p-8">
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-24 rounded-xl skeleton-shimmer" />
                ))}
              </div>
            ) : history.length > 0 ? (
            <div className="space-y-8">
              {Object.entries(groupedHistory).map(([date, items]) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-4">
                    <Calendar className="w-4 h-4 text-stone-400 dark:text-slate-500" />
                    <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{date}</h2>
                    <div className="flex-1 h-px bg-stone-200 dark:bg-slate-700" />
                  </div>
                  
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-stone-200 dark:border-slate-700 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1 line-clamp-2">
                              {item.article_title}
                            </h3>
                            <div className="flex items-center gap-3 text-sm text-stone-500 dark:text-slate-400">
                              <span>{item.source}</span>
                              <span>•</span>
                              <span>{item.category}</span>
                              <span>•</span>
                              <span>{item.read_date ? format(new Date(item.read_date), 'h:mm a') : ''}</span>
                            </div>
                          </div>
                          <a
                            href={item.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800 transition-colors"
                          >
                            Read Again
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-20 h-20 rounded-2xl bg-stone-200 dark:bg-slate-700 flex items-center justify-center mb-6">
                <Clock className="w-10 h-10 text-stone-400 dark:text-slate-500" />
              </div>
              <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
                No reading history yet
              </h3>
              <p className="text-stone-500 dark:text-slate-400 max-w-sm">
                Start reading articles and they'll appear here in your history.
              </p>
            </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
