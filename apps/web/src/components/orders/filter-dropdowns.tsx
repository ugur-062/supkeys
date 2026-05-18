"use client";

import type { OrderCounterpart, OrderDateRange } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { Building2, Calendar } from "lucide-react";

const RANGE_OPTIONS: Array<{ value: OrderDateRange; label: string }> = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "6m", label: "Son 6 Ay" },
  { value: "12m", label: "Son 12 Ay" },
];

const SELECT_CLS = cn(
  "pl-9 pr-8 py-2 text-sm rounded-lg appearance-none bg-white cursor-pointer w-full md:w-auto md:min-w-[170px]",
  "border border-slate-200 text-brand-900",
  "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
);

export function RangeDropdown({
  value,
  onChange,
}: {
  value: OrderDateRange;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-full md:w-auto">
      <Calendar className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Tarih aralığı"
        className={SELECT_CLS}
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CounterpartProps {
  value: string;
  onChange: (v: string) => void;
  options: OrderCounterpart[];
  loading: boolean;
  /** "Tüm Tedarikçiler" veya "Tüm Alıcılar" gibi default ilk seçenek. */
  placeholder: string;
}

export function CounterpartDropdown({
  value,
  onChange,
  options,
  loading,
  placeholder,
}: CounterpartProps) {
  return (
    <div className="relative w-full md:w-auto">
      <Building2 className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        disabled={loading}
        className={cn(SELECT_CLS, "md:min-w-[200px]")}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label} ({o.orderCount})
          </option>
        ))}
      </select>
    </div>
  );
}
