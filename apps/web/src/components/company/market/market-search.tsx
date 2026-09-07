"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";
import { useFilters } from "@/components/marketplace/filter-shell";

/**
 * PAZAR BANDI ARAMASI — sayfanın kendi süzgeç kabuğuna yazar.
 *
 * Liste sayfasında ayrı bir arama kutusu olması ŞART: liste artık
 * anasayfada değil, oraya dönüp yeniden aramak gezinme borcu olurdu.
 * Yazmak süzgeçleri KORUR (yalnız `q` ve sayfa değişir) — "İstanbul +
 * doğrulanmış" seçip sonra kelimeyi değiştiren kullanıcı seçimini
 * kaybetmemeli.
 */
export function MarketSearch<S extends { q?: string; page: number }>({
  placeholder,
  label = "Ara",
}: {
  placeholder: string;
  label?: string;
}) {
  const { state, update } = useFilters<S>();
  const [value, setValue] = useState(state.q ?? "");
  // URL dışarıdan değişirse (çip kaldırma, geri tuşu) kutu da güncellenir.
  useEffect(() => setValue(state.q ?? ""), [state.q]);

  const submit = (next: string) => {
    const q = next.trim();
    if ((state.q ?? "") === q) return;
    update({ q: q || undefined } as Partial<S>);
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="flex items-center gap-2 rounded-xl bg-white p-1.5 shadow-sm"
    >
      <MagnifyingGlassIcon aria-hidden className="ml-2 size-5 shrink-0 text-zinc-400" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
        >
          <XMarkIcon aria-hidden className="size-4" />
          <span className="sr-only">Aramayı temizle</span>
        </button>
      ) : null}
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {label}
      </button>
    </form>
  );
}
