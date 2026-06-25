"use client";

import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import type { ComponentType } from "react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  ariaLabel: string;
  icon?: ComponentType<{ className?: string }>;
  /** Varsayılandan farklı bir değer seçiliyse pill koyu (aktif) görünür. */
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Liste sayfaları için pill-tarzı filtre seçici. Aktifken (varsayılan dışı
 * değer) koyu dolu, değilse açık çerçeveli. Catalyst monokrom dili.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  icon: Icon,
  active = false,
  disabled = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative inline-flex h-9 items-center rounded-lg ring-1 transition-colors",
        active
          ? "bg-zinc-900 text-white ring-zinc-900"
          : "bg-white text-zinc-700 ring-zinc-950/10 hover:ring-zinc-950/20",
        disabled && "opacity-50",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "pointer-events-none absolute left-2.5 h-4 w-4",
            active ? "text-white/80" : "text-zinc-400",
          )}
        />
      ) : null}
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-full w-full cursor-pointer appearance-none bg-transparent py-1.5 pr-8 text-sm font-medium focus:outline-none disabled:cursor-not-allowed",
          Icon ? "pl-9" : "pl-3",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-white text-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className={cn(
          "pointer-events-none absolute right-2 h-4 w-4",
          active ? "text-white/70" : "text-zinc-400",
        )}
      />
    </div>
  );
}
