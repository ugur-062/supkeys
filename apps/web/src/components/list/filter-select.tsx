"use client";

import { cn } from "@/lib/utils";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
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
 * Liste sayfaları için pill-tarzı filtre seçici. P0 (frontend denetimi):
 * native <select> yerine Headless UI Listbox — OS varsayılan listesi yerine
 * uygulama diliyle açılır panel (check ikonu, klavye desteği yerleşik).
 * Props API'si değişmedi; tüm liste filtreleri bu tek bileşenden geçer.
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
  const selected =
    options.find((o) => o.value === value) ?? options[0] ?? null;
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={cn("relative inline-flex", className)}>
        <ListboxButton
          aria-label={ariaLabel}
          className={cn(
            "relative inline-flex h-9 w-full items-center rounded-lg py-1.5 pr-8 text-sm font-medium ring-1 transition-colors focus:outline-none data-focus:ring-2 data-focus:ring-zinc-950",
            Icon ? "pl-9" : "pl-3",
            active
              ? "bg-zinc-900 text-white ring-zinc-900"
              : "bg-white text-zinc-700 ring-zinc-950/10 hover:ring-zinc-950/20",
            disabled && "cursor-not-allowed opacity-50",
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
          <span className="truncate">{selected?.label ?? ""}</span>
          <ChevronDownIcon
            className={cn(
              "pointer-events-none absolute right-2 h-4 w-4",
              active ? "text-white/70" : "text-zinc-400",
            )}
            aria-hidden
          />
        </ListboxButton>
        <ListboxOptions modal={false}
          anchor="bottom start"
          transition
          className="z-50 mt-1 min-w-[calc(var(--button-width)+2rem)] rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5 transition duration-100 focus:outline-none data-closed:opacity-0 [--anchor-gap:0.25rem]"
        >
          {options.map((o, i) => (
            <ListboxOption
              // value boş/yinelenen gelse bile (bozuk veri) key benzersiz kalsın.
              key={`${o.value ?? ""}-${i}`}
              value={o.value}
              className="group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-700 data-focus:bg-zinc-100 data-selected:font-semibold data-selected:text-zinc-950"
            >
              <CheckIcon
                className="invisible size-4 shrink-0 text-zinc-950 group-data-selected:visible"
                aria-hidden
              />
              <span className="truncate">{o.label}</span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
