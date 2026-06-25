"use client";

import { cn } from "@/lib/utils";

interface Props {
  rows?: number;
  className?: string;
}

/**
 * Tablo/satır listeleri için yükleme skeleton'u. Her satırda avatar yer
 * tutucusu + 2 metin satırı + sağda pill placeholder.
 */
export function ListSkeleton({ rows = 5, className }: Props) {
  return (
    <div className={cn("divide-y divide-surface-border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="px-4 sm:px-6 py-4 flex items-center gap-4"
          aria-hidden="true"
        >
          <div className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-4 bg-slate-200 rounded animate-pulse w-1/3" />
            <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
          </div>
          <div className="h-6 w-20 bg-slate-200 rounded-full animate-pulse flex-shrink-0" />
          <div className="h-5 w-16 bg-slate-100 rounded animate-pulse flex-shrink-0 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}
