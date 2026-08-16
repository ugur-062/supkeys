"use client";

import { cn } from "@/lib/utils";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";

export interface SelectMenuOption {
  value: string;
  label: string;
  /** Seçenek altında küçük gri açıklama satırı (opsiyonel). */
  description?: string;
}

/**
 * P2 (frontend denetimi §8.6) — FORM içi tek <Select>: native <select>'in
 * OS varsayılan listesi yerine Headless UI Listbox (check ikonu, klavye,
 * uygulama dili). Liste filtrelerindeki pill-tarzı FilterSelect'in form
 * varyantı — input'larla aynı yükseklik/kenar dili. Tek bilinçli native
 * istisna: PhoneInput ülke seçici (mobil native liste orada daha iyi).
 */
export function SelectMenu({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={cn("relative", className)}>
        <ListboxButton
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "relative flex w-full items-center rounded-lg border border-zinc-950/10 bg-white py-1.5 pr-8 pl-3 text-left text-sm text-zinc-900 shadow-sm transition-colors hover:border-zinc-950/20 focus:outline-none data-focus:ring-2 data-focus:ring-zinc-950",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <span className="truncate">{selected?.label ?? "— seç —"}</span>
          <ChevronDownIcon
            className="pointer-events-none absolute right-2 h-4 w-4 text-zinc-400"
            aria-hidden
          />
        </ListboxButton>
        <ListboxOptions modal={false}
          anchor="bottom start"
          transition
          className="z-50 mt-1 min-w-[calc(var(--button-width))] max-w-96 rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg ring-1 ring-zinc-950/5 transition focus:outline-none data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 [--anchor-gap:0.25rem]"
        >
          {options.map((o, i) => (
            <ListboxOption
              key={`${o.value ?? ""}-${i}`}
              value={o.value}
              className="group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-700 data-focus:bg-zinc-100 data-selected:font-semibold data-selected:text-zinc-950"
            >
              <CheckIcon
                className="invisible mt-0.5 size-4 shrink-0 text-zinc-950 group-data-selected:visible"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.description ? (
                  <span className="block text-xs font-normal text-zinc-500">
                    {o.description}
                  </span>
                ) : null}
              </span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
