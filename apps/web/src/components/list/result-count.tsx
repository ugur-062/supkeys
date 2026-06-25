"use client";

import { cn } from "@/lib/utils";

interface Props {
  total: number;
  isFiltered: boolean;
  unit?: string;
  className?: string;
}

export function ResultCount({
  total,
  isFiltered,
  unit = "sonuç",
  className,
}: Props) {
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
