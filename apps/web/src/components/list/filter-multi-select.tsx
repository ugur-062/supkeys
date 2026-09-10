"use client";

import { cn } from "@/lib/utils";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import type { ComponentType } from "react";
import type { FilterSelectOption } from "./filter-select";

interface Props {
  /** Seçili değerler; BOŞ = süzgeç yok ("Tümü"). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Seçenekler — "Tümü" satırı BURAYA YAZILMAZ, bileşen kendisi ekler. */
  options: FilterSelectOption[];
  /** Hiçbir şey seçili değilken düğme metni ("Tüm Durumlar"). */
  allLabel: string;
  ariaLabel: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  disabled?: boolean;
}

/**
 * ÇOKLU SEÇİMLİ süzgeç (2026-09-10, kullanıcı kararı: "birden fazla
 * seçebilsin, tüm panellerde"). `FilterSelect` ile AYNI görünüm (pill, ikon,
 * aktifken koyu); fark: Headless UI Listbox `multiple`, her seçenek onay
 * kutulu, panel seçimden sonra AÇIK kalır. İlk satır "Tümü" seçimi temizler.
 * Düğme: hiçbiri → allLabel · biri → adı · çoğu → "N seçili".
 */
export function FilterMultiSelect({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
  icon: Icon,
  className,
  disabled = false,
}: Props) {
  const active = value.length > 0;
  const label =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} seçili`;
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled} multiple>
      <div className={cn("relative inline-flex", className)}>
        <ListboxButton
          aria-label={ariaLabel}
          className={cn(
            "relative inline-flex h-9 w-full items-center rounded-lg py-1.5 pr-8 text-sm font-medium ring-1 transition-colors focus:outline-none data-focus:ring-2 data-focus:ring-zinc-950",
            Icon ? "pl-9" : "pl-3",
            active ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-950/10 hover:ring-zinc-950/20",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {Icon ? <Icon className={cn("pointer-events-none absolute left-2.5 h-4 w-4", active ? "text-white/80" : "text-zinc-400")} /> : null}
          <span className="truncate">{label}</span>
          <ChevronDownIcon className={cn("pointer-events-none absolute right-2 h-4 w-4", active ? "text-white/70" : "text-zinc-400")} aria-hidden />
        </ListboxButton>
        <ListboxOptions
          modal={false}
          anchor="bottom start"
          transition
          className="z-50 mt-1 min-w-[calc(var(--button-width)+2rem)] rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5 transition focus:outline-none data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 [--anchor-gap:0.25rem]"
        >
          {/* "Tümü" — seçimi temizler; Listbox değeri değil, düz düğme. */}
          <button
            type="button"
            role="option"
            aria-selected={!active}
            onClick={() => onChange([])}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100",
              !active && "font-semibold text-zinc-950",
            )}
          >
            <CheckIcon className={cn("size-4 shrink-0 text-zinc-950", active && "invisible")} aria-hidden />
            <span className="truncate">{allLabel}</span>
          </button>
          <div className="my-1 border-t border-zinc-950/5" aria-hidden />
          {options.map((o, i) => (
            <ListboxOption
              key={`${o.value ?? ""}-${i}`}
              value={o.value}
              className="group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-700 data-focus:bg-zinc-100 data-selected:font-semibold data-selected:text-zinc-950"
            >
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white group-data-selected:border-zinc-950 group-data-selected:bg-zinc-950"
              >
                <CheckIcon className="invisible size-3 text-white group-data-selected:visible" />
              </span>
              <span className="truncate">{o.label}</span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
