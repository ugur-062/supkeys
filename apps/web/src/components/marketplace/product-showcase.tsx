"use client";

import { ProductCard } from "./product-card";
import type { ProductIndexCard } from "@/lib/public/marketplace-api";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SEKMELİ ÜRÜN KAYDIRICISI — TEK kaydırıcı, üç sekme (B5, 2026-09-04):
 * Öne çıkan · Yeni · Fiyatı yazılı. Eskiden "Öne çıkan" ve "Son eklenen" iki
 * ayrı bölümdü ve aynı kartlar iki kez geçiyordu; sekmeler aynı yeri
 * paylaşır. Oklar bir görünüm genişliği kaydırır; CSS scroll-snap; klavye:
 * liste odaklıyken ← → kaydırır, sekmelerde ← → sekme değiştirir (WAI tabs).
 * JS gelmezse ilk sekme yatay kaydırılabilir liste olarak zaten çalışır.
 */
export const SHOWCASE_MIN = 8;
/** Bir sekmenin görünmesi için gereken en az ürün. */
const TAB_MIN = 4;

export interface ShowcaseGroup {
  key: string;
  label: string;
  items: ProductIndexCard[];
  href: string;
  hrefLabel: string;
}

export function ProductShowcase({
  heading,
  lead,
  groups,
  idPrefix = "urun-vitrini",
}: {
  heading: string;
  lead?: string;
  groups: ShowcaseGroup[];
  /**
   * Sekme/panel `id` ÖNEKİ — SABİT, `useId()` DEĞİL.
   *
   * DÜZELTME (2026-09-04): önce anasayfadaki hydration hatasının (#418)
   * sebebi sanıldı, DEĞİLDİ — hata sürdü. Gerçek sebep ÖLÜ GÖRSEL ADRESİ:
   * iki firmanın logo/kapağı kapalı `pub-*.r2.dev` host'unda; tarayıcı
   * görseli yükleyemeyince `CompanyLogo` yedeğe düşüyor ve React sunucu
   * HTML'iyle uyuşmazlık bildiriyor. Kalıcı çözüm veri tarafında
   * (`scripts/migrate-public-images.ts` + Cloudflare custom domain).
   *
   * Sabit önek yine de KALIYOR: `useId` değeri her build'de değişir ve
   * anlamsız bir sözleşmedir; sayfada tek vitrin var, iki tane olacaksa
   * çağıran farklı önek verir.
   */
  idPrefix?: string;
}) {
  const tabs = groups.filter((g, i) => g.items.length >= (i === 0 ? SHOWCASE_MIN : TAB_MIN));
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [edge, setEdge] = useState({ start: true, end: false });
  const uid = idPrefix;

  const syncEdge = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    syncEdge();
    el.addEventListener("scroll", syncEdge, { passive: true });
    const ro = new ResizeObserver(syncEdge);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncEdge);
      ro.disconnect();
    };
  }, [syncEdge, active]);

  if (tabs.length === 0 || !tabs[0]) return null;
  const group = tabs[Math.min(active, tabs.length - 1)] ?? tabs[0];

  const scrollBy = (dir: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const select = (i: number) => {
    setActive(i);
    listRef.current?.scrollTo({ left: 0 });
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % n;
    else if (e.key === "ArrowLeft") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next == null) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section aria-labelledby={`${uid}-h`}>
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id={`${uid}-h`} className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              {heading}
            </h2>
            {lead ? <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">{lead}</p> : null}
          </div>
          <Link href={group.href} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
            {group.hrefLabel}
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div role="tablist" aria-label={heading} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1">
            {tabs.map((t, i) => {
              const on = i === active;
              return (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${t.key}`}
                  aria-selected={on}
                  aria-controls={`${uid}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(i)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${
                    on ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-950"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 text-xs tabular-nums ${on ? "text-zinc-300" : "text-zinc-600"}`}>{t.items.length}</span>
                </button>
              );
            })}
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={edge.start}
              aria-label="Önceki ürünler"
              className="flex size-9 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950 hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeftIcon aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={edge.end}
              aria-label="Sonraki ürünler"
              className="flex size-9 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950 hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRightIcon aria-hidden className="size-5" />
            </button>
          </div>
        </div>

        {/* `tabpanel` rolü <ul>'a VERİLEMEZ (ARIA: liste öğelerinin rolü
            kısıtlı; Lighthouse aria-allowed-role) — sarmalayıcı div taşır. */}
        <div
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${group.key}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              scrollBy(1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              scrollBy(-1);
            }
          }}
          className="mt-5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        >
        <ul
          ref={listRef}
          // `scroll-pl-*` = yatay padding: ilk kartın snap noktası scrollLeft=0'da
          // olsun. Yoksa Chrome yüklenişte 24px "snap" kaydırır; o scroll olayı
          // LCP raporunu keser (Lighthouse NO_LCP, CrUX'ta kayıp metrik).
          className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 pb-2 scroll-pl-6 lg:-mx-8 lg:px-8 lg:scroll-pl-8 [scrollbar-width:thin]"
        >
          {group.items.map((p, i) => (
            <li key={`${p.company.slug}/${p.slug}`} className="w-64 shrink-0 snap-start sm:w-72">
              <ProductCard
                product={p}
                companySlug={p.company.slug}
                company={p.company}
                priority={active === 0 && i < 4}
              />
            </li>
          ))}
        </ul>
        </div>
      </div>
    </section>
  );
}
