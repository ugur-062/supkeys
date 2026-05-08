"use client";

import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

export interface SortOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SortOption[];
  className?: string;
}

export function SortDropdown({ value, onChange, options, className }: Props) {
  return (
    <div className={cn("relative", className)}>
      <ArrowUpDown className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "pl-9 pr-8 py-2 text-sm rounded-lg appearance-none bg-white cursor-pointer min-w-[200px]",
          "border border-surface-border text-brand-900",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
