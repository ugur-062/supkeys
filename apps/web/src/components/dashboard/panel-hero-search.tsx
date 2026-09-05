"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * PANEL ARAMA BLOĞU — Europages "Ne arıyorsunuz?" kalıbı (2026-09-05,
 * kullanıcı kararı): iki panelin anasayfası da herkese açık sitedeki hero
 * gibi büyük bir arama kutusuyla açılır. Kart içinde DEĞİL: tam genişlikte,
 * ferah bir bölüm; ince renk lekesi portal vurgusunu taşır.
 *
 *  · Satınalma → ürün arar (`/company/satinalma/urunler?q=`); "Ürün Ara"
 *    sol menüden KALKTI, giriş noktası bu kutu.
 *  · Satış     → açık alım taleplerini arar (`/company/satis?q=` — liste anasayfada).
 *
 * Düz `<form method="get">`: JavaScript gelmeden de çalışır (sonuç sayfası
 * `?q=` okur); JS'de `router.push` ile tam sayfa yenileme olmaz. Yazarken
 * öneri: veri ÇAĞIRANDAN gelir (`suggestions` + `onQueryChange`) — kutu
 * hangi ucun konuşulacağını bilmez, panelin kendi uçları kullanılır (herkese
 * açık `public/suggest` panelde YASAK). Çipler en dolu kategoriler.
 */
export interface PanelHeroChip {
  id: string;
  name: string;
  count: number;
  href: string;
}

export interface PanelSuggestGroup {
  label: string;
  rows: { key: string; label: string; meta?: string; href: string }[];
}

export function PanelHeroSearch({
  eyebrow,
  title,
  lead,
  placeholder,
  action,
  chips = [],
  chipsLabel = "Popüler",
  accent = "blue",
  suggestions = [],
  onQueryChange,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
  placeholder: string;
  /** Sonuç sayfası — `?q=` okuyan liste. */
  action: string;
  chips?: PanelHeroChip[];
  chipsLabel?: string;
  accent?: "blue" | "emerald";
  /** Yazarken öneriler — çağıran hesaplar (≥2 karakter). */
  suggestions?: PanelSuggestGroup[];
  onQueryChange?: (q: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = q.trim();
    setOpen(false);
    // Sonuç listesi AYNI sayfadaysa (satış: açık talepler anasayfada) seçili
    // süzgeçler korunur, yalnız arama ve sayfa değişir — başka sayfaya
    // giderken temiz `?q=`.
    const keep = new URLSearchParams(action === pathname ? (sp?.toString() ?? "") : "");
    keep.delete("q");
    keep.delete("sayfa");
    const parts = [...keep.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (term) parts.push(`q=${encodeURIComponent(term)}`);
    router.push(parts.length ? `${action}?${parts.join("&")}` : action);
  };
  const hasSug = q.trim().length >= 2 && suggestions.some((g) => g.rows.length > 0);
  const tone =
    accent === "blue"
      ? { glow: "var(--color-blue-200)", eyebrow: "text-blue-700" }
      : { glow: "var(--color-emerald-200)", eyebrow: "text-emerald-700" };

  return (
    <section aria-label={title} className="relative isolate -mx-1 px-1 pt-2 pb-4 sm:pt-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[26rem] w-[56rem] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: `radial-gradient(closest-side, ${tone.glow}, transparent)` }}
      />
      <div className="mx-auto max-w-2xl text-center">
        {eyebrow ? (
          <p className={`text-sm/6 font-semibold ${tone.eyebrow}`}>{eyebrow}</p>
        ) : null}
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base/7 text-pretty text-zinc-500">{lead}</p>

        {/* `data-hero-search`: üst çubuk araması bu kutuyu gözler — kutu
            görünümdeyken gizli, kaydırınca ve diğer sayfalarda görünür. */}
        <form
          data-hero-search
          action={action}
          method="get"
          role="search"
          onSubmit={onSubmit}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          className="relative mt-7"
        >
          <div className="flex items-stretch gap-2">
            <div className="relative flex flex-1 items-center rounded-full bg-white shadow-lg shadow-zinc-950/5 ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950">
              <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-4 size-5 text-zinc-400" />
              <input
                type="search"
                name="q"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  onQueryChange?.(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                aria-label={title}
                autoComplete="off"
                className="h-14 w-full rounded-full bg-transparent pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
              />
            </div>
            <button
              type="submit"
              className="h-14 shrink-0 rounded-full bg-zinc-950 px-7 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            >
              Ara
            </button>
          </div>

          {open && hasSug ? (
            <div
              role="listbox"
              aria-label="Öneriler"
              className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-white text-left shadow-xl ring-1 ring-zinc-950/10"
            >
              {suggestions
                .filter((g) => g.rows.length > 0)
                .map((g) => (
                  <div key={g.label} className="border-b border-zinc-950/5 py-1 last:border-b-0">
                    <p className="px-4 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
                      {g.label}
                    </p>
                    <ul>
                      {g.rows.map((r) => (
                        <li key={r.key}>
                          <Link
                            href={r.href}
                            role="option"
                            aria-selected={false}
                            className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                          >
                            <span className="line-clamp-1">{r.label}</span>
                            {r.meta ? <span className="shrink-0 text-xs text-zinc-500">{r.meta}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : null}
        </form>

        {chips.length > 0 ? (
          <nav aria-label={chipsLabel} className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-xs">
            <span className="text-zinc-500">{chipsLabel}:</span>
            {chips.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="inline-flex max-w-[15rem] items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 transition hover:bg-zinc-950 hover:text-white"
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-zinc-400 tabular-nums">{c.count}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
