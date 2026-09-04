"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { categoryPath } from "@/lib/public/marketplace";
import type { SuggestResult } from "@/lib/public/marketplace-api";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";

/**
 * HERO ARAMASI — İKİ sekme (Ürünler · Firmalar, Europages kalıbı) + yazarken
 * öneri (ürün + kategori + firma; `GET public/suggest`).
 *
 * Düz `<form method="get">` — JavaScript kapalıyken de varsayılan sekmeye
 * (ürünler) arama yapar; sekme yalnız `action`ı değiştirir. Öneri kutusu
 * ilerleyici: gelmezse arama yine çalışır. Alım talepleri arama sekmesinde
 * DEĞİL — talep gizli/cezbedici, listesi header'dan bir tık.
 */
export interface HeroSearchTab {
  key: "products" | "companies";
  label: string;
  action: string;
  placeholder: string;
}

const EMPTY: SuggestResult = { products: [], categories: [], companies: [] };

export function HeroSearch({ tabs }: { tabs: HeroSearchTab[] }) {
  const [active, setActive] = useState(tabs[0]);
  const [q, setQ] = useState("");
  const [sug, setSug] = useState<SuggestResult>(EMPTY);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setSug(EMPTY);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const base = resolveApiBaseUrl();
        if (!base) return;
        const res = await fetch(`${base}/public/suggest?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        setSug((await res.json()) as SuggestResult);
        setOpen(true);
      } catch {
        /* öneri yoksa arama yine çalışır */
      }
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const hasSug = sug.products.length + sug.categories.length + sug.companies.length > 0;

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Nerede aransın"
        className="mx-auto mb-3 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full bg-zinc-100 p-1"
      >
        {tabs.map((t) => {
          const on = t.key === active.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                on ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <form
        action={active.action}
        method="get"
        role="search"
        className="relative w-full"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <div className="flex items-stretch gap-2">
          <div className="relative flex flex-1 items-center rounded-full bg-white shadow-lg shadow-zinc-950/5 ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950">
            <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-4 size-5 text-zinc-400" />
            <input
              type="search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => hasSug && setOpen(true)}
              placeholder={active.placeholder}
              aria-label={`${active.label} içinde ara`}
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
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-white text-left shadow-xl ring-1 ring-zinc-950/10">
            {sug.products.length > 0 ? (
              <SugGroup label="Ürünler">
                {sug.products.map((p) => (
                  <SugRow key={`${p.companySlug}/${p.slug}`} href={`/firma/${p.companySlug}/urun/${p.slug}`} label={p.name} />
                ))}
              </SugGroup>
            ) : null}
            {sug.categories.length > 0 ? (
              <SugGroup label="Kategoriler">
                {sug.categories.map((c) => (
                  <SugRow key={c.id} href={categoryPath(c.id, c.name)} label={c.name} />
                ))}
              </SugGroup>
            ) : null}
            {sug.companies.length > 0 ? (
              <SugGroup label="Firmalar">
                {sug.companies.map((c) => (
                  <SugRow key={c.slug} href={`/firma/${c.slug}`} label={c.name} meta={c.city ?? undefined} />
                ))}
              </SugGroup>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function SugGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-950/5 py-1 last:border-b-0">
      <p className="px-4 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{label}</p>
      <ul>{children}</ul>
    </div>
  );
}

function SugRow({ href, label, meta }: { href: string; label: string; meta?: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50">
        <span className="line-clamp-1">{label}</span>
        {meta ? <span className="shrink-0 text-xs text-zinc-400">{meta}</span> : null}
      </Link>
    </li>
  );
}
