"use client";

import { Chip } from "@/components/ui/chip";

import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useEffect, useId, useState, type ReactNode } from "react";

/**
 * SÜZGEÇ YAPI TAŞLARI — ürün süzgeci (`product-filters.tsx`) ve açık talep
 * süzgeci (`company/request-filters.tsx`) AYNI parçaları kullanır:
 *  · `Group`   — <fieldset><legend>, seçili sayısı + bölüm temizle, daraltılır
 *                (durum localStorage `rothern.filters.<key>`)
 *  · `Check`   — checkbox/radio satırı; sayısı 0 olan seçenek soluk + devre dışı
 *                (seçili değilse)
 *  · `ShowMore`/`ShowMoreRadio` — ilk 6, "Tümünü göster (n)"; seçili her zaman görünür
 *  · `FilterChipBar` — aktif süzgeç çipleri (yapışkan şerit) + "Tümünü temizle"
 * İki süzgeç görsel olarak ayrışmasın diye tek dosya (2026-09-05).
 */
export const SHOW = 6;

export function useOpenState(storageKey: string, initial = true) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`rothern.filters.${storageKey}`);
      if (v === "0") setOpen(false);
    } catch {
      /* depolama yok */
    }
  }, [storageKey]);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(`rothern.filters.${storageKey}`, next ? "1" : "0");
    } catch {
      /* depolama yok */
    }
  };
  return [open, toggle] as const;
}

export function Group({
  title,
  count,
  onClear,
  storageKey,
  children,
}: {
  title: string;
  count: number;
  onClear: () => void;
  storageKey: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useOpenState(storageKey);
  const id = useId();
  return (
    <fieldset className="border-t border-zinc-950/5 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-1 text-left text-xs font-semibold tracking-wide text-zinc-600 uppercase hover:text-zinc-950"
        >
          <legend className="contents">
            {title}
            {count > 0 ? <span className="ml-1 normal-case text-zinc-950">({count})</span> : null}
          </legend>
          <ChevronDownIcon aria-hidden className={`ml-auto size-4 transition ${open ? "" : "-rotate-90"}`} />
        </button>
        {count > 0 ? (
          <button type="button" onClick={onClear} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-950">
            Temizle
          </button>
        ) : null}
      </div>
      <div id={id} hidden={!open} className="mt-3 space-y-1">
        {children}
      </div>
    </fieldset>
  );
}

export function Check({
  id,
  label,
  count,
  checked,
  onChange,
  type = "checkbox",
  name,
}: {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  const disabled = count === 0 && !checked;
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-zinc-100 ${
        checked ? "font-medium text-zinc-950" : "text-zinc-700"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          name={name}
          type={type}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 shrink-0 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
        />
        <span className="line-clamp-1">{label}</span>
      </span>
      {count != null ? <span className="shrink-0 text-xs text-zinc-500">{count}</span> : null}
    </label>
  );
}

export interface FacetOption {
  key: string;
  label: string;
  count: number;
}

export function ShowMore({
  items,
  selected,
  idPrefix,
  onToggle,
  emptyText = "Seçenek yok",
}: {
  items: FacetOption[];
  selected: string[];
  idPrefix: string;
  onToggle: (key: string, on: boolean) => void;
  emptyText?: string;
}) {
  const [all, setAll] = useState(false);
  // Seçili olanlar her zaman görünür (kısıtlı listede kaybolmasın).
  const visible = all ? items : items.filter((i, idx) => idx < SHOW || selected.includes(i.key));
  if (items.length === 0) return <p className="px-2 text-xs text-zinc-500">{emptyText}</p>;
  return (
    <>
      {visible.map((i) => (
        <Check
          key={i.key}
          id={`${idPrefix}-${i.key}`}
          label={i.label}
          count={i.count}
          checked={selected.includes(i.key)}
          onChange={(on) => onToggle(i.key, on)}
        />
      ))}
      {items.length > SHOW ? (
        <button type="button" onClick={() => setAll(!all)} className="px-2 pt-1 text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950">
          {all ? "Daha az göster" : `Tümünü göster (${items.length})`}
        </button>
      ) : null}
    </>
  );
}

export function ShowMoreRadio({
  items,
  selected,
  idPrefix,
  onSelect,
  emptyText = "Seçenek yok",
}: {
  items: FacetOption[];
  selected?: string;
  idPrefix: string;
  onSelect: (key: string) => void;
  emptyText?: string;
}) {
  const [all, setAll] = useState(false);
  const visible = all ? items : items.filter((i, idx) => idx < SHOW || i.key === selected);
  if (items.length === 0) return <p className="px-2 text-xs text-zinc-500">{emptyText}</p>;
  return (
    <>
      {visible.map((i) => (
        <Check
          key={i.key}
          id={`${idPrefix}-${i.key}`}
          label={i.label}
          count={i.count}
          checked={selected === i.key}
          onChange={() => onSelect(i.key)}
        />
      ))}
      {items.length > SHOW ? (
        <button type="button" onClick={() => setAll(!all)} className="px-2 pt-1 text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950">
          {all ? "Daha az göster" : `Tümünü göster (${items.length})`}
        </button>
      ) : null}
    </>
  );
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Aktif süzgeç çipleri — yapışkan şerit (listenin üstünde). Çip yoksa hiç çizilmez. */
export function FilterChipBar({
  chips,
  activeCount,
  onClearAll,
  sticky = true,
}: {
  chips: FilterChip[];
  activeCount: number;
  onClearAll: () => void;
  sticky?: boolean;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      className={`${sticky ? "sticky top-20 z-20" : ""} -mx-2 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/90 px-2 py-2 text-sm ring-1 ring-zinc-950/5 backdrop-blur`}
    >
      <span className="text-zinc-500">Süzgeçler:</span>
      {chips.map((c) => (
        <Chip key={c.key} onRemove={c.onRemove} removeLabel={`${c.label} süzgecini kaldır`} className="h-7 text-xs">
          {c.label}
        </Chip>
      ))}
      <button type="button" onClick={onClearAll} className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600">
        Tümünü temizle
      </button>
      <span className="sr-only">{activeCount} süzgeç aktif</span>
    </div>
  );
}
