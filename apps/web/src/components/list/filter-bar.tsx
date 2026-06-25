"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  activeFilterCount?: number;
  onClearAll?: () => void;
  className?: string;
}

export function FilterBar({
  children,
  activeFilterCount = 0,
  onClearAll,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap gap-2 items-center">{children}</div>

      {activeFilterCount > 0 && onClearAll ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {activeFilterCount} filtre aktif
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-700 font-semibold"
          >
            <X className="h-3 w-3" />
            Temizle
          </button>
        </div>
      ) : null}
    </div>
  );
}
