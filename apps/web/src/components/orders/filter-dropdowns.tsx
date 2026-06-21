"use client";

import { Select } from "@/components/catalyst/select";
import type { OrderCounterpart, OrderDateRange } from "@/lib/tenders/types";

const RANGE_OPTIONS: Array<{ value: OrderDateRange; label: string }> = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "6m", label: "Son 6 Ay" },
  { value: "12m", label: "Son 12 Ay" },
];

export function RangeDropdown({
  value,
  onChange,
}: {
  value: OrderDateRange;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Tarih aralığı"
      className="w-full md:w-auto md:min-w-[170px]"
    >
      {RANGE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
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
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
      disabled={loading}
      className="w-full md:w-auto md:min-w-[200px]"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label} ({o.orderCount})
        </option>
      ))}
    </Select>
  );
}
