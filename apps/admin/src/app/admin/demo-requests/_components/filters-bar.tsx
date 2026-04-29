"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMO_REQUEST_STATUS_META,
  DEMO_REQUEST_STATUS_ORDER,
} from "@/lib/demo-requests/status";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

interface FiltersBarProps {
  search: string;
  status: DemoRequestStatus | "";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: DemoRequestStatus | "") => void;
  onClear: () => void;
}

export function FiltersBar({
  search,
  status,
  onSearchChange,
  onStatusChange,
  onClear,
}: FiltersBarProps) {
  const [searchInput, setSearchInput] = useState(search);

  // External (URL) sync edildiğinde input'u güncelle
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounce search → URL
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== search) {
        onSearchChange(searchInput);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasFilters = !!search || !!status;

  return (
    <div className="admin-card p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          type="search"
          placeholder="Firma, ad veya e-posta ara…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      <select
        value={status}
        onChange={(e) =>
          onStatusChange(e.target.value as DemoRequestStatus | "")
        }
        className={cn(
          "px-3.5 py-2.5 rounded-lg border bg-white text-admin-text text-sm",
          "border-admin-border-strong focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
          "min-w-[180px]",
        )}
      >
        <option value="">Tüm statüler</option>
        {DEMO_REQUEST_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {DEMO_REQUEST_STATUS_META[s].label}
          </option>
        ))}
      </select>

      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onClear}
        disabled={!hasFilters}
        className="shrink-0"
      >
        <X className="w-4 h-4" />
        Temizle
      </Button>
    </div>
  );
}
