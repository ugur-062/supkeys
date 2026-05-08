"use client";

import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

/**
 * Polish-1 — Liste sayfaları için debounced search input.
 * URL/dış değişiklikler `value` prop'tan iç state'e senkronlanır.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Ara...",
  className,
  debounceMs = 300,
}: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const debounced = useDebouncedCallback((v: string) => {
    onChange(v);
  }, debounceMs);

  const handleChange = (v: string) => {
    setLocal(v);
    debounced(v);
  };

  const handleClear = () => {
    setLocal("");
    debounced.cancel();
    onChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-white",
          "border border-surface-border text-brand-900 placeholder:text-slate-400",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
        )}
      />
      {local ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-muted rounded-md text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Aramayı temizle"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
