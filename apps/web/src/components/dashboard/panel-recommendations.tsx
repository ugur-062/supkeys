"use client";

import { ProductCard } from "@/components/marketplace/product-card";
import { useDiscoverSearch } from "@/hooks/use-portal-discovery";
import { PANEL_MARKET, panelProductPath } from "@/lib/company/panel-market";
import { recentSearches } from "@/lib/company/recent-searches";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const LIMIT = 8;

/**
 * ÜRÜN TAVSİYESİ ŞERİDİ — "aramalarınıza ve kategorilerinize göre"
 * (2026-09-07, kullanıcı kararı).
 *
 * İKİ GİRDİ, İKİ ŞERİT — aynı listeyi iki kez basmamak için:
 *  · `mode="match"` (arama kutusunun hemen altı): SON ARAMA varsa onunla
 *    süzülmüş sonuçlar ("… aramanıza göre"), yoksa listenin varsayılan
 *    sırası — alıcının ALIM kategorileriyle örtüşenler önde (`matchesProfile`).
 *  · `mode="fresh"` (kategori vitrininin altı): `sort=newest`, "yeni eklenen".
 *
 * Neden ikisi ayrı: geçmişi olmayan kullanıcıda iki şerit de kategori
 * eşleşmesine düşse AYNI sekiz ürün iki kez basılırdı. "Yeni eklenen" her
 * hâlükârda farklı bir kesit.
 *
 * ARAMA GEÇMİŞİ TARAYICI-YERELDİR ve efektte okunur: sunucu render'ında
 * `localStorage` yok, koşulu render'a taşımak hydration uyuşmazlığı olurdu
 * (aynı ders: 2026-09-05 React #418).
 *
 * Şerit boşsa bölüm HİÇ çizilmez — boş kutu basmayız.
 */
export function PanelRecommendations({ mode }: { mode: "match" | "fresh" }) {
  const [term, setTerm] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(mode === "fresh");
  useEffect(() => {
    if (mode !== "match") return;
    setTerm(recentSearches("satinalma")[0]);
    setReady(true);
  }, [mode]);

  const { data, isLoading } = useDiscoverSearch(
    mode === "fresh"
      ? { pageSize: LIMIT, sort: "newest" }
      : { pageSize: LIMIT, ...(term ? { q: term } : {}) },
  );
  const items = data?.items ?? [];
  // Geçmiş okunmadan istek atılmasın: `q`siz sonuç gelip sonra `q`li sonuçla
  // değişince şerit gözle görülür biçimde zıplıyordu.
  if (!ready) return null;
  if (!isLoading && items.length === 0) return null;

  const copy =
    mode === "fresh"
      ? { title: "Yeni eklenen ürünler", lead: "Tedarikçilerin vitrinlerine en son eklediği ürünler." }
      : term
        ? { title: "Aramalarınıza göre", lead: `Son aradığınız “${term}” ile eşleşen tedarikçi ürünleri.` }
        : {
            title: "Size uygun ürünler",
            lead: "Alım kategorilerinizle örtüşen tedarikçi ürünleri.",
          };

  return (
    <section aria-labelledby={`oneri-${mode}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`oneri-${mode}`} className="text-lg font-semibold tracking-tight text-zinc-950">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{copy.lead}</p>
        </div>
        <Link
          href={
            mode === "fresh"
              ? `${PANEL_MARKET.products}?sirala=yeni`
              : term
                ? `${PANEL_MARKET.products}?q=${encodeURIComponent(term)}`
                : PANEL_MARKET.products
          }
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          Tümünü gör
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-hidden" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[22rem] w-64 shrink-0 animate-pulse rounded-xl bg-zinc-100 sm:w-72" />
          ))}
        </div>
      ) : (
        <ul
          // `scroll-pl-*` ŞART: ilk kartın snap noktası scrollLeft=0'da
          // olmazsa Chrome yüklenişte kaydırır ve o scroll olayı LCP
          // raporunu keser (2026-09-04'te ölçüldü).
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6 [scrollbar-width:thin]"
        >
          {items.map((p) => (
            <li key={`${p.company.slug}/${p.slug}`} className="w-64 shrink-0 snap-start sm:w-72">
              <ProductCard
                product={p}
                company={p.company}
                href={panelProductPath(p.company.slug, p.slug)}
                features={p.features}
                cta="Bilgi iste"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
