"use client";

import { useFilters } from "./filter-shell";

/**
 * SIRALAMA ÇUBUĞU — genel (PROMPT 4): masaüstünde çipler, mobilde <select>.
 * Durum `useFilters()` bağlamındaki `sort` alanı; `undefined` = varsayılan
 * (ilk seçenek). Ürün dizininin fiyat yön okulu özel çubuğu ayrı kalır.
 */
export function SortBar<S extends { sort?: string; page: number }>({
  options,
}: {
  options: { value: S["sort"] | undefined; label: string }[];
}) {
  const { state, update } = useFilters<S>();
  return (
    <>
      <div className="hidden items-center gap-1 text-xs sm:flex">
        <span className="text-zinc-500">Sırala:</span>
        {options.map((o) => {
          const active = (o.value ?? "") === (state.sort ?? "");
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={active}
              onClick={() => update({ sort: o.value } as Partial<S>)}
              className={`rounded-full px-2.5 py-1 font-medium transition ${active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <label className="text-xs text-zinc-500 sm:hidden">
        <span className="sr-only">Sırala</span>
        <select
          value={state.sort ?? ""}
          onChange={(e) => update({ sort: (e.target.value || undefined) as S["sort"] } as Partial<S>)}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
        >
          {options.map((o) => (
            <option key={o.label} value={o.value ?? ""}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
