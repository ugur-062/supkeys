"use client";

import { FilterResults, FilterShell, MobileFilterButton, ResultCount, useFilters } from "@/components/marketplace/filter-shell";
import { ProductCard } from "@/components/marketplace/product-card";
import { ActiveFilterChips, ProductFilters, SortControl } from "@/components/marketplace/product-filters";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { useDiscoverProductFacets, useDiscoverSearch } from "@/hooks/use-portal-discovery";
import { buildProductFilterQuery, parseProductFilters, toProductListParams } from "@/lib/public/product-filter-params";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * PANEL "ÜRÜN ARA" — herkese açık `/urunler` ile AYNI süzgeç bileşeni
 * (`ProductFilters`), aynı URL şeması ve aynı sunucu kuralı (`product-index.ts`).
 * Fark: veri istemcide (TanStack Query) ve kendi ürünler hariç.
 */
const BASE = "/company/satinalma/urunler";

export function DiscoverProductsView() {
  const sp = useSearchParams();
  const state = parseProductFilters(sp ?? new URLSearchParams());
  const params = toProductListParams(state);
  const result = useDiscoverSearch(params);
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
  const router = useRouter();
  const pathname = usePathname();
  const { update } = useFilters();
  const [q, setQ] = useState(state.q ?? "");
  useEffect(() => setQ(state.q ?? ""), [state.q]);
  const p = toProductListParams(state);
  const facets = useDiscoverProductFacets({ category: p.category, q: p.q, city: p.city, activity: p.activity, verified: p.verified, price: p.price });
  const data = result.data;
  const hasFilter = buildProductFilterQuery({ ...state, q: undefined, sort: undefined, page: 1 }) !== "";
  const talepHref = `/company/satinalma/taleplerim/yeni${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`;

  return (
    <PageContainer>
      <PageHeader
        title="Ürün Ara"
        description="Tedarikçi firmaların vitrinlerindeki ürünler. Kategori, şehir ve faaliyet tipine göre süzün; beğendiğiniz ürünün firmasından bilgi isteyin."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || undefined });
        }}
        role="search"
        className="relative mt-6 max-w-md"
      >
        <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün, marka veya parça numarası"
          aria-label="Ürün ara"
          className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </form>

      {facets.data ? <div className="mt-4"><ActiveFilterChips facets={facets.data} /></div> : null}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
        <aside
          aria-label="Süzgeçler"
          className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-2 [scrollbar-width:thin]"
        >
          <PanelFilters idPrefix="d" />
        </aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount noun="ürün" />
            </span>
            <SortControl />
          </div>
          <FilterResults>
            {result.isLoading ? (
              <p className="text-sm text-zinc-500">Yükleniyor…</p>
            ) : !data || data.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center">
                <p className="text-base font-semibold text-zinc-900">Bu kriterlerle ürün yok.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
                  <Link href={talepHref} className="rounded-full bg-zinc-950 px-4 py-2 font-semibold text-white transition hover:bg-zinc-800">
                    Talep aç — tedarikçiler teklif versin
                  </Link>
                  {hasFilter ? (
                    <button type="button" onClick={() => router.replace(pathname)} className="rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white">
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
                  />
                ))}
              </div>
            )}
          </FilterResults>
          {data && data.total > data.pageSize ? (
            <nav aria-label="Sayfalama" className="mt-8 flex items-center justify-between text-sm">
              <button type="button" disabled={state.page <= 1} onClick={() => update({ page: state.page - 1 } as never)} className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium disabled:opacity-40">
                Önceki
              </button>
              <span className="text-zinc-500">Sayfa {state.page} / {Math.ceil(data.total / data.pageSize)}</span>
              <button type="button" disabled={state.page * data.pageSize >= data.total} onClick={() => update({ page: state.page + 1 } as never)} className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium disabled:opacity-40">
                Sonraki
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
