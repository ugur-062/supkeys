"use client";

import { X } from "lucide-react";

/**
 * P2 (frontend denetimi §10.2) — aktif filtreler kaldırılabilir chip'ler +
 * "Tümünü temizle". Hangi filtrelerin devrede olduğu yalnız select'lerin
 * koyulaşmasından okunmuyordu; chip satırı filtre durumunu açıkça söyler
 * ve tek tıkla geri alınır. Filtre yoksa hiç render edilmez.
 */
export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilterChips({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pr-1 pl-2.5 text-xs font-medium text-zinc-700"
        >
          {f.label}
          <button
            type="button"
            onClick={f.onRemove}
            aria-label={`${f.label} filtresini kaldır`}
            className="flex size-4 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {filters.length > 1 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-zinc-500 underline transition hover:text-zinc-900"
        >
          Tümünü temizle
        </button>
      ) : null}
    </div>
  );
}
