"use client";

import { FilterResults, FilterShell, MobileFilterButton, ResultCount, useFilters } from "@/components/marketplace/filter-shell";
import { ProductCard } from "@/components/marketplace/product-card";
import { ActiveFilterChips, ProductFilters, SortControl } from "@/components/marketplace/product-filters";
import { useDiscoverProductFacets, useDiscoverSearch } from "@/hooks/use-portal-discovery";
import { buildProductFilterQuery, parseProductFilters, toProductListParams } from "@/lib/public/product-filter-params";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * ÜRÜNLER — satınalma ANASAYFASINA gömülü, kenar süzgeçli ürün dizini
 * (2026-09-05; satış anasayfasındaki Açık Talepler ile aynı kalıp).
 *
 * · Herkese açık `/urunler` ile AYNI süzgeç bileşeni (`ProductFilters`), aynı
 *   URL şeması (`product-filter-params`), aynı sunucu kuralı (`product-index`).
 *   Fark: veri istemcide (TanStack Query), kendi ürünler hariç, ALICIYA GÖRE
 *   UYGUNLUK sırası (alım kategorisiyle örtüşen ürünler önce — kartta rozet).
 * · Kendi arama kutusu YOK: hero `?q=` yazar (aynı sayfa, süzgeçler korunur),
 *   burada yalnız çip. Üst çubuk araması kaydırınca devam ettirir.
 * · Sayfa boyutu 12 (anasayfa; alt bloklar erişilebilir kalsın).
 */
const BASE = "/company/satinalma";
export const HOME_PRODUCT_PAGE_SIZE = 12;

export function ProductDiscoverySection() {
  const sp = useSearchParams();
  const state = parseProductFilters(sp ?? new URLSearchParams());
  const params = toProductListParams(state);
  const result = useDiscoverSearch({ ...params, pageSize: HOME_PRODUCT_PAGE_SIZE });
  const total = result.data?.total ?? 0;
  return (
    <FilterShell basePath={BASE} total={total} drawer={<PanelFilters idPrefix="m" />}>
      <Inner state={state} result={result} />
    </FilterShell>
  );
}

function PanelFilters({ idPrefix }: { idPrefix: string }) {
  const { state } = useFilters();
  const p = toProductListParams(state);
  const facets = useDiscoverProductFacets({ category: p.category, q: p.q, city: p.city, activity: p.activity, verified: p.verified, price: p.price });
  if (!facets.data) return <p className="text-sm text-zinc-500">Süzgeçler yükleniyor…</p>;
  return <ProductFilters facets={facets.data} idPrefix={idPrefix} />;
}

function Inner({ state, result }: { state: ReturnType<typeof parseProductFilters>; result: ReturnType<typeof useDiscoverSearch> }) {
  const { update, clear } = useFilters();
  const p = toProductListParams(state);
  const facets = useDiscoverProductFacets({ category: p.category, q: p.q, city: p.city, activity: p.activity, verified: p.verified, price: p.price });
  const data = result.data;
  const hasFilter = buildProductFilterQuery({ ...state, sort: undefined, page: 1 }) !== "";
  const talepHref = `/company/satinalma/taleplerim/yeni${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`;
  const pageSize = data?.pageSize ?? HOME_PRODUCT_PAGE_SIZE;
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <section id="urunler" aria-labelledby="urunler-baslik" className="scroll-mt-20 space-y-4">
      <div>
        <h2 id="urunler-baslik" className="text-lg font-semibold tracking-tight text-zinc-950">
          Ürünler
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Tedarikçi vitrinlerindeki ürünler — alım kategorinize uygun olanlar önde; süzün, karşılaştırın, bilgi isteyin.
        </p>
      </div>

      {facets.data ? <ActiveFilterChips facets={facets.data} /> : null}
      {state.q ? (
        <p className="text-sm text-zinc-600">
          Arama: <span className="font-medium text-zinc-950">&ldquo;{state.q}&rdquo;</span>
          <button type="button" onClick={() => update({ q: undefined })} className="ml-2 text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-950">
            Aramayı kaldır
          </button>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
        <aside
          aria-label="Süzgeçler"
          className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-2 [scrollbar-width:thin]"
        >
          <PanelFilters idPrefix="d" />
        </aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount noun="ürün" />
            </span>
            <SortControl />
          </div>
          <FilterResults>
            {result.isLoading ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-80 animate-pulse rounded-2xl bg-zinc-100" />
                ))}
              </div>
            ) : !data || data.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center">
                <p className="text-base font-semibold text-zinc-900">Bu kriterlerle ürün yok.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
                  <Link href={talepHref} className="rounded-full bg-zinc-950 px-4 py-2 font-semibold text-white transition hover:bg-zinc-800">
                    Talep aç — tedarikçiler teklif versin
                  </Link>
                  {hasFilter ? (
                    <button type="button" onClick={() => { clear(); update({ q: undefined }); }} className="rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white">
                      Filtreleri temizle
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((p) => (
                  <ProductCard
                    key={`${p.company.slug}/${p.slug}`}
                    product={p}
                    company={p.company}
                    href={`/company/satinalma/urunler/${p.company.slug}/${p.slug}`}
                    cta="Bilgi iste"
                    badge={
                      p.matchesProfile ? (
                        <span className="inline-flex items-center rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200">
                          Alım kategorinizle eşleşiyor
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </FilterResults>
          {data && data.total > pageSize ? (
            <nav aria-label="Sayfalama" className="mt-8 flex items-center justify-between text-sm">
              <button type="button" disabled={state.page <= 1} onClick={() => update({ page: state.page - 1 })} className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium disabled:opacity-40">
                Önceki
              </button>
              <span className="text-zinc-500">Sayfa {state.page} / {pages}</span>
              <button type="button" disabled={state.page >= pages} onClick={() => update({ page: state.page + 1 })} className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium disabled:opacity-40">
                Sonraki
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
