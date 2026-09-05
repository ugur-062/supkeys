"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * PANEL ARAMA KUTUSU — Europages "Ne arıyorsunuz?" kalıbı (2026-09-05,
 * kullanıcı kararı): iki panelin anasayfası da herkese açık sitedeki hero
 * gibi büyük bir arama kutusuyla açılır.
 *
 *  · Satınalma → ürün arar (`/company/satinalma/urunler?q=`); "Ürün Ara"
 *    sol menüden KALKTI, giriş noktası bu kutu.
 *  · Satış     → açık alım taleplerini arar (`/company/satis/acik-talepler?q=`).
 *
 * Düz `<form method="get">`: JavaScript gelmeden de çalışır (sonuç sayfası
 * `?q=` okur); JS'de `router.push` ile tam sayfa yenileme olmaz. Altındaki
 * çipler en dolu kategoriler — arama logu yok, sayı gerçek envanterden.
 */
export interface PanelHeroChip {
  id: string;
  name: string;
  count: number;
  href: string;
}

export function PanelHeroSearch({
  title,
  lead,
  placeholder,
  action,
  chips = [],
  chipsLabel = "Popüler",
  accent = "blue",
}: {
  title: string;
  lead: string;
  placeholder: string;
  /** Sonuç sayfası — `?q=` okuyan liste. */
  action: string;
  chips?: PanelHeroChip[];
  chipsLabel?: string;
  accent?: "blue" | "emerald";
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `${action}?q=${encodeURIComponent(term)}` : action);
  };
  const glow = accent === "blue" ? "var(--color-blue-200)" : "var(--color-emerald-200)";

  return (
    <section
      aria-label={title}
      className="relative isolate overflow-hidden rounded-3xl bg-white px-6 py-10 shadow-sm ring-1 ring-zinc-950/5 sm:px-10 sm:py-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }}
      />
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm/6 text-zinc-500 sm:text-base/7">{lead}</p>

        <form action={action} method="get" role="search" onSubmit={onSubmit} className="mt-6">
          <div className="flex items-stretch gap-2">
            <div className="relative flex flex-1 items-center rounded-full bg-white shadow-lg shadow-zinc-950/5 ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950">
              <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-4 size-5 text-zinc-400" />
              <input
                type="search"
                name="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                aria-label={title}
                autoComplete="off"
                className="h-13 w-full rounded-full bg-transparent pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
              />
            </div>
            <button
              type="submit"
              className="h-13 shrink-0 rounded-full bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            >
              Ara
            </button>
          </div>
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
