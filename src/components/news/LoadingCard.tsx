import React from 'react';
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingCard({ index = 0 }: { index?: number }) {
  return (
    <div
      className="news-card-enter bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 overflow-hidden"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <Skeleton className="aspect-[16/9] w-full" />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="w-20 h-5 rounded-full" />
        </div>
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-3/4 mb-3" />
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="bg-stone-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
