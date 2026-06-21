"use client";

import { FilterSelect } from "@/components/list";
import type { OrderCounterpart, OrderDateRange } from "@/lib/tenders/types";
import { Building2, CalendarRange } from "lucide-react";

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
    <FilterSelect
      icon={CalendarRange}
      value={value}
      onChange={onChange}
      options={RANGE_OPTIONS}
      ariaLabel="Tarih aralığı"
      active={value !== "all"}
    />
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
    <FilterSelect
      icon={Building2}
      value={value}
      onChange={onChange}
      ariaLabel={placeholder}
      disabled={loading}
      active={value !== ""}
      options={[
        { value: "", label: placeholder },
        ...options.map((o) => ({
          value: o.id,
          label: `${o.label} (${o.orderCount})`,
        })),
      ]}
    />
  );
}
