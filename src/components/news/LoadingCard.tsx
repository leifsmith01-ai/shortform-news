import React from 'react';
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingCard() {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <Skeleton className="aspect-[16/9] w-full" />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="w-20 h-5 rounded-full" />
        </div>
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-3/4 mb-3" />
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="bg-stone-50 rounded-xl p-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}