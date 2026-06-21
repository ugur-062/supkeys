"use client";

import { Select } from "@/components/catalyst/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

interface FiltersBarProps<T extends string> {
  search: string;
  status: T | "";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: T | "") => void;
  onClear: () => void;
  /** Status select için opsiyonlar — null verilirse select gizlenir */
  statusOptions?: { value: T; label: string }[] | null;
  searchPlaceholder?: string;
}

export function FiltersBar<T extends string>({
  search,
  status,
  onSearchChange,
  onStatusChange,
  onClear,
  statusOptions,
  searchPlaceholder = "Firma adı veya vergi no ara…",
}: FiltersBarProps<T>) {
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

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
    <div className="card p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {statusOptions && (
        <Select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as T | "")}
          className="md:min-w-[180px]"
        >
          <option value="">Tümü</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      )}

      <Button
        type="button"
        variant="secondary"
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
