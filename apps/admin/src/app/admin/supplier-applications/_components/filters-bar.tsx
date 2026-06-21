"use client";

import { Select } from "@/components/catalyst/select";
import { SearchInput } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_ORDER,
} from "@/lib/applications/status";
import type { ApplicationStatus } from "@/lib/applications/types";
import { X } from "lucide-react";

interface FiltersBarProps {
  search: string;
  status: ApplicationStatus | "";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ApplicationStatus | "") => void;
  onClear: () => void;
}

export function FiltersBar({
  search,
  status,
  onSearchChange,
  onStatusChange,
  onClear,
}: FiltersBarProps) {
  const hasFilters = !!search || !!status;

  return (
    <div className="admin-card p-3 flex flex-col md:flex-row md:items-center gap-3">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Firma adı, e-posta veya vergi no ara…"
        className="flex-1 min-w-0"
      />

      <Select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as ApplicationStatus | "")}
        aria-label="Statü filtresi"
        className="md:w-52"
      >
        <option value="">Tüm statüler</option>
        {APPLICATION_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {APPLICATION_STATUS_META[s].label}
          </option>
        ))}
      </Select>

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
