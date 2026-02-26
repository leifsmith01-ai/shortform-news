import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import api from '@/api';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';

export default function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, isLoaded: userLoaded } = useUser();

  // Re-run when the Clerk user finishes loading (fixes race condition on mobile where
  // History mounts before UserInitialiser has had a chance to call api.setUser())
  useEffect(() => {
    if (!userLoaded) return;
    // Safety net: ensure api has the user set even if UserInitialiser fires late
    if (user?.id) api.setUser(user.id);
    loadHistory();
  }, [userLoaded, user?.id]);

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
                {history.length} articles read
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-8">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-xl animate-pulse" />
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
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
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
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-stone-200 dark:bg-slate-700 flex items-center justify-center mb-6">
                <Clock className="w-10 h-10 text-stone-400 dark:text-slate-500" />
              </div>
              <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
                No reading history yet
              </h3>
              <p className="text-stone-500 dark:text-slate-400 max-w-sm">
                Start reading articles and they'll appear here in your history.
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
