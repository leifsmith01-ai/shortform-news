import React from 'react';
import { Globe, Newspaper } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EmptyState({ hasFilters }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-6"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center mb-6">
        {hasFilters ? (
          <Newspaper className="w-10 h-10 text-stone-400 dark:text-slate-500" />
        ) : (
          <Globe className="w-10 h-10 text-stone-400 dark:text-slate-500" />
        )}
      </div>
      <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
        {hasFilters ? 'Fetching your news...' : 'Select your preferences'}
      </h3>
      <p className="text-stone-500 dark:text-slate-400 max-w-sm">
        {hasFilters 
          ? 'We\'re gathering and summarizing the top stories for you.'
          : 'Choose at least one country and one category from the sidebar to get started.'
        }
      </p>
    </motion.div>
  );
}