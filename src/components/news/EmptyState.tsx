import React from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-6"
    >
      <motion.div
        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center mb-6"
        animate={hasFilters ? {} : { y: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        {hasFilters ? (
          <Loader2 className="w-10 h-10 text-stone-400 dark:text-slate-400 animate-spin" />
        ) : (
          <Globe className="w-10 h-10 text-stone-400 dark:text-slate-500" />
        )}
      </motion.div>

      <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
        {hasFilters ? 'Fetching your news' : 'Select your preferences'}
      </h3>

      {hasFilters ? (
        <>
          <div className="flex items-center gap-1.5 mb-4">
            <span className="loading-dot w-2 h-2 rounded-full bg-stone-400 dark:bg-slate-500 inline-block" />
            <span className="loading-dot w-2 h-2 rounded-full bg-stone-400 dark:bg-slate-500 inline-block" />
            <span className="loading-dot w-2 h-2 rounded-full bg-stone-400 dark:bg-slate-500 inline-block" />
          </div>
          <p className="text-stone-500 dark:text-slate-400 max-w-sm">
            We&rsquo;re gathering and summarizing the top stories for you.
          </p>
        </>
      ) : (
        <p className="text-stone-500 dark:text-slate-400 max-w-sm">
          Choose at least one country and one category from the sidebar to get started.
        </p>
      )}
    </motion.div>
  );
}
