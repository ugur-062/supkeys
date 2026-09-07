"use client";

import { ProductCard } from "@/components/marketplace/product-card";
import { useDiscoverSearch } from "@/hooks/use-portal-discovery";
import { PANEL_MARKET, panelProductPath } from "@/lib/company/panel-market";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const LIMIT = 8;

/**
 * ÖNE ÇIKAN ÜRÜNLER — anasayfanın pazar GİRİŞİ.
 *
 * Anasayfada artık tam ızgara yok (kendi sayfasına taşındı); burada
 * yalnız bir şerit ve "Tüm ürünler →" var. Sıralama listenin varsayılanı
 * (uygunluk): alıcının ALIM kategorileriyle örtüşen ürünler önde — yani
 * "öne çıkan" reklam değil, ALAKA.
 *
 * Şerit boşsa bölüm HİÇ çizilmez (boş kutu yok).
 */
export function PanelFeaturedProducts() {
  const { data, isLoading } = useDiscoverSearch({ pageSize: LIMIT });
  const items = data?.items ?? [];
  if (!isLoading && items.length === 0) return null;

  return (
    <section aria-labelledby="one-cikan-urunler">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="one-cikan-urunler" className="text-lg font-semibold tracking-tight text-zinc-950">
            Size uygun ürünler
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Alım kategorilerinizle örtüşen tedarikçi ürünleri.
          </p>
        </div>
        <Link
          href={PANEL_MARKET.products}
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
        >
          Tüm ürünler
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
                accent="blue"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
