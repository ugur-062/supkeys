"use client";

import { cn } from "@/lib/utils";

interface Props {
  total: number;
  isFiltered: boolean;
  unit?: string;
  className?: string;
  /** B6: veri henüz yüklenmediyse "0 ihale" basma — küçük skeleton göster. */
  isLoading?: boolean;
}

export function ResultCount({
  total,
  isFiltered,
  unit = "sonuç",
  className,
  isLoading = false,
}: Props) {
  if (isLoading) {
    return (
      <span
        aria-hidden
        className={cn(
          "h-4 w-16 animate-pulse rounded bg-slate-200/80",
          className,
        )}
      />
    );
  }
  return (
    <p className={cn("text-sm text-slate-500", className)}>
      <strong className="text-zinc-900 font-semibold">
        {total.toLocaleString("tr-TR")}
      </strong>{" "}
      {unit}
      {isFiltered ? (
        <span className="text-slate-400 ml-1">(filtrelenmiş)</span>
      ) : null}
    </p>
  );
}
