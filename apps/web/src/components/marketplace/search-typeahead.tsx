"use client";

import { Avatar } from "@/components/ui/avatar";
import { Thumb } from "@/components/ui/thumb";
import { categoryPath, listingPath, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import type { SuggestResult } from "@/lib/public/marketplace-api";
import {
  EMPTY_SUGGEST,
  fetchSuggest,
  pushRecentSearch,
  readRecentSearches,
  type SuggestScope,
} from "@/lib/public/suggest-client";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ClockIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * ARAMA + ÖNERİ — TEK bileşen (PROMPT 6), iki boyut.
 *
 *  · `lg` — anasayfa hero'su: kapsam sekmeleri üstte, 56 px kutu, "Ara" düğmesi.
 *  · `sm` — üst çubuk: kapsam seçici kutunun İÇİNDE (▾), 40 px.
 *
 * Hero araması ile header araması eskiden iki ayrı uygulamaydı; öneri kutusu
 * yalnız hero'da vardı ve klavyeyle gezilemiyordu. Tek bileşen: kapsam, öneri,
 * klavye ve son aramalar bir kez yazıldı.
 *
 * İLERLEYİCİ: düz `<form method="get">` — JS yokken de kapsamın liste
 * sayfasına `?q=` ile gider. Öneri kutusu bir EK; gelmezse arama çalışır.
 * Erişilebilirlik: WAI combobox (aria-expanded/-controls/-activedescendant),
 * ↑↓ gezinir, Enter seçer (seçim yoksa formu gönderir), Esc kapatır.
 */
export interface ScopeOption {
  key: SuggestScope;
  label: string;
  /** Form hedefi — liste sayfası. */
  action: string;
  placeholder: string;
}

export const SEARCH_SCOPES: Record<SuggestScope, ScopeOption> = {
  products: {
    key: "products",
    label: "Ürünler",
    action: MARKETPLACE_ROUTES.products,
    placeholder: "Ürün, marka veya parça numarası arayın",
  },
  companies: {
    key: "companies",
    label: "Firmalar",
    action: MARKETPLACE_ROUTES.companies,
    placeholder: "Firma adı, sektör veya hizmet",
  },
  listings: {
    key: "listings",
    label: "Talepler",
    action: MARKETPLACE_ROUTES.demands,
    placeholder: "Talep başlığı veya kategori",
  },
};

type Row = { key: string; href: string; label: string; meta?: string; node?: React.ReactNode; group: string };

function rowsFrom(s: SuggestResult): Row[] {
  const rows: Row[] = [];
  for (const c of s.categories) {
    rows.push({ key: `c-${c.id}`, href: categoryPath(c.id, c.name), label: c.name, group: "Kategoriler" });
  }
  for (const p of s.products) {
    rows.push({
      key: `p-${p.companySlug}/${p.slug}`,
      href: `/firma/${p.companySlug}/urun/${p.slug}`,
      label: p.name,
      meta: p.companyName,
      node: <Thumb src={p.image ?? undefined} alt="" size="sm" className="size-8 rounded-md" />,
      group: "Ürünler",
    });
  }
  for (const c of s.companies) {
    rows.push({
      key: `f-${c.slug}`,
      href: `/firma/${c.slug}`,
      label: c.name,
      meta: c.city ?? undefined,
      node: <Avatar name={c.name} src={c.logoUrl} size={32} />,
      group: "Firmalar",
    });
  }
  for (const l of s.listings ?? []) {
    rows.push({
      key: `t-${l.number}`,
      href: listingPath(l.number, l.title),
      label: l.title,
      meta: l.number,
      group: "Alım talepleri",
    });
  }
  return rows;
}

export function SearchTypeahead({
  size = "sm",
  scopes = ["products", "companies", "listings"],
  defaultScope = "products",
  className,
  autoFocus = false,
}: {
  size?: "sm" | "lg";
  scopes?: SuggestScope[];
  defaultScope?: SuggestScope;
  className?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const [scope, setScope] = useState<SuggestScope>(defaultScope);
  const [q, setQ] = useState("");
  const [sug, setSug] = useState<SuggestResult>(EMPTY_SUGGEST);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opt = SEARCH_SCOPES[scope];
  const big = size === "lg";

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setSug(EMPTY_SUGGEST);
      setActive(-1);
      return;
    }
    timer.current = setTimeout(() => {
      void fetchSuggest(term, scope).then((r) => {
        setSug(r);
        setActive(-1);
        setOpen(true);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, scope]);

  const rows = useMemo(() => rowsFrom(sug), [sug]);
  const showRecent = q.trim().length < 2 && recent.length > 0;
  const panel = open && (rows.length > 0 || showRecent);

  const go = (href: string) => {
    pushRecentSearch(q);
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!panel || rows.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = rows.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1 >= n ? 0 : i + 1) : i <= 0 ? n - 1 : i - 1));
      return;
    }
    if (e.key === "Enter" && active >= 0 && rows[active]) {
      e.preventDefault();
      go(rows[active].href);
    }
  };

  let lastGroup = "";

  return (
    <div className={cn("relative w-full", className)}>
      {big && scopes.length > 1 ? (
        <div
          role="tablist"
          aria-label="Nerede aransın"
          className="mx-auto mb-3 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-full bg-zinc-100 p-1"
        >
          {scopes.map((k) => {
            const on = k === scope;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setScope(k)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition",
                  on ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-950",
                )}
              >
                {SEARCH_SCOPES[k].label}
              </button>
            );
          })}
        </div>
      ) : null}

      <form
        action={opt.action}
        method="get"
        role="search"
        className="relative w-full"
        onSubmit={() => pushRecentSearch(q)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <div className="flex items-stretch gap-2">
          <div
            className={cn(
              "relative flex flex-1 items-center bg-white ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950",
              big ? "rounded-full shadow-lg shadow-zinc-950/5" : "rounded-full",
            )}
          >
            {!big && scopes.length > 1 ? (
              /* Kapsam seçici kutunun İÇİNDE — dar üst çubukta ayrı sekme
                 satırına yer yok. Native <select>: klavye ve mobil bedava. */
              <label className="relative flex h-full shrink-0 items-center border-r border-zinc-950/10 pr-1 pl-3">
                <span className="sr-only">Arama kapsamı</span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as SuggestScope)}
                  className="cursor-pointer appearance-none bg-transparent py-1 pr-4 text-xs font-medium text-zinc-700 outline-none"
                >
                  {scopes.map((k) => (
                    <option key={k} value={k}>
                      {SEARCH_SCOPES[k].label}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon aria-hidden className="pointer-events-none absolute right-1 size-3.5 text-zinc-400" />
              </label>
            ) : (
              <MagnifyingGlassIcon
                aria-hidden
                className={cn("pointer-events-none absolute text-zinc-400", big ? "left-4 size-5" : "left-3 size-4")}
              />
            )}
            <input
              type="search"
              name="q"
              value={q}
              autoFocus={autoFocus}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                setRecent(readRecentSearches());
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              placeholder={opt.placeholder}
              aria-label={`${opt.label} içinde ara`}
              role="combobox"
              aria-expanded={panel}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 && rows[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              className={cn(
                "w-full bg-transparent text-zinc-950 outline-none placeholder:text-zinc-400",
                big ? "h-14 rounded-full pr-4 pl-11 text-base" : "h-10 rounded-full pr-3 pl-3 text-sm",
                !big && scopes.length <= 1 && "pl-9",
              )}
            />
          </div>
          {big ? (
            <button
              type="submit"
              className="h-14 shrink-0 rounded-full bg-zinc-950 px-7 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            >
              Ara
            </button>
          ) : null}
        </div>

        {panel ? (
          <div
            id={listId}
            role="listbox"
            aria-label="Arama önerileri"
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-white text-left shadow-xl ring-1 ring-zinc-950/10"
          >
            {showRecent ? (
              <div className="py-1">
                <p className="px-4 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
                  Son aramalar
                </p>
                <ul>
                  {recent.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setQ(r);
                          setOpen(true);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        <ClockIcon aria-hidden className="size-4 shrink-0 text-zinc-300" />
                        <span className="line-clamp-1">{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul>
              {rows.map((row, i) => {
                const head = row.group !== lastGroup ? row.group : null;
                lastGroup = row.group;
                return (
                  <li key={row.key}>
                    {head ? (
                      <p className="border-t border-zinc-950/5 px-4 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase first:border-t-0">
                        {head}
                      </p>
                    ) : null}
                    <Link
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      href={row.href}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pushRecentSearch(q)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 text-sm text-zinc-800",
                        i === active ? "bg-zinc-100" : "hover:bg-zinc-50",
                      )}
                    >
                      {row.node}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1">{row.label}</span>
                        {row.meta ? <span className="block truncate text-xs text-zinc-500">{row.meta}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </form>
    </div>
  );
}
