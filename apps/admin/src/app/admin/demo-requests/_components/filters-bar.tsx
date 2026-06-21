"use client";

import { Select } from "@/components/catalyst/select";
import { SearchInput } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  DEMO_REQUEST_STATUS_META,
  DEMO_REQUEST_STATUS_ORDER,
} from "@/lib/demo-requests/status";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import { X } from "lucide-react";

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
  const hasFilters = !!search || !!status;

  return (
    <div className="admin-card p-3 flex flex-col md:flex-row md:items-center gap-3">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Firma, ad veya e-posta ara…"
        className="flex-1 min-w-0"
      />

      <Select
        value={status}
        onChange={(e) =>
          onStatusChange(e.target.value as DemoRequestStatus | "")
        }
        aria-label="Statü filtresi"
        className="md:w-48"
      >
        <option value="">Tüm statüler</option>
        {DEMO_REQUEST_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {DEMO_REQUEST_STATUS_META[s].label}
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
