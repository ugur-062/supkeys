"use client";

import { FilterShellCore, ResultCount, useFilters } from "@/components/marketplace/filter-shell";
import { CompanyActiveChips, CompanyFilters, CompanySortBar } from "@/components/marketplace/company-filters";
import { CompanyCard } from "@/components/marketplace/company-card";
import { useCompanySearch, useCompanySearchFacets, type DirectoryCompany } from "@/hooks/use-company-directory";
import { useDiscoverSearch } from "@/hooks/use-portal-discovery";
import {
  activeCompanyFilterCount,
  buildCompanyFilterQuery,
  clearCompanyFilters,
  parseCompanyFilters,
  toPanelDirectoryParams,
  type CompanyFilterState,
} from "@/lib/public/company-filter-params";
import { PANEL_MARKET, panelCategoryPath, panelCompanyPath, panelProductPath } from "@/lib/company/panel-market";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketHeader, MarketTabs } from "./market-band";
import { MarketEmpty, MarketGrid, MarketGridSkeleton, MarketListLayout } from "./market-list-layout";
import { MarketDiscoveryFooter } from "./market-discovery-footer";

/**
 * Firma süzgecinden ÜRÜN dizini adresi — arama ve (varsa) tek kategori
 * taşınır. Kategori seçiliyse ürün tarafında KATEGORİ SAYFASI kanonik
 * adrestir; ama ad elimizde olmadığından sorgu şemasıyla gidiyoruz
 * (`?kategori=`), sayfa oraya kendi kanonik yoluna yönlendirmez — liste
 * aynıdır, adres paylaşılabilir kalır.
 */
function productsHref(state: CompanyFilterState): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.categories.length === 1) sp.set("kategori", state.categories[0] as string);
  const qs = sp.toString();
  return `${PANEL_MARKET.products}${qs ? `?${qs}` : ""}`;
}

/** Bağlantı durumu rozeti — pazar listesinde de görünür (panelin yapısal avantajı). */
const STATUS_BADGE: Record<string, { label: string; className: string } | undefined> = {
  active: { label: "Bağlısınız", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  pending: { label: "İstek gönderildi", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  incoming: { label: "İstek geldi", className: "bg-blue-50 text-blue-700 ring-blue-200" },
};

/**
 * PANEL FİRMA DİZİNİ — pazar bölgesinin firma tarafı
 * (`/company/satinalma/firmalar`).
 *
 * Eskiden firma listesi Bağlantılar › Keşfet sekmesinin içindeydi ve orada
 * süzgeçler yerel `useState`teydi: URL'ye yazılmıyor, sayfalama yok,
 * şehir/kategori/sıralama yok. Aynı dizin iki yerde iki farklı yetenekle
 * yaşıyordu. Liste artık burada; Bağlantılar YALNIZ ilişki yönetimi.
 */
export function PanelCompanyIndex() {
  const sp = useSearchParams();
  const state = parseCompanyFilters(sp ?? new URLSearchParams());
  const params = toPanelDirectoryParams(state);
  const result = useCompanySearch(params);
  const total = result.data?.total ?? 0;
  return (
    <FilterShellCore
      state={state}
      toUrl={(next) => `${PANEL_MARKET.companies}${buildCompanyFilterQuery(next)}`}
      clearState={clearCompanyFilters}
      total={total}
      activeCount={activeCompanyFilterCount(state)}
      drawer={<PanelCompanyFilters idPrefix="m" />}
      drawerHideAt="xl"
      accent="blue"
    >
      <Inner state={state} result={result} />
    </FilterShellCore>
  );
}

function PanelCompanyFilters({ idPrefix }: { idPrefix: string }) {
  const { state } = useFilters<CompanyFilterState>();
  const facets = useCompanySearchFacets(toPanelDirectoryParams(state));
  if (!facets.data) return <p className="text-sm text-zinc-500">Süzgeçler yükleniyor…</p>;
  return <CompanyFilters facets={facets.data} idPrefix={idPrefix} showConnection />;
}

function Inner({
  state,
  result,
}: {
  state: CompanyFilterState;
  result: ReturnType<typeof useCompanySearch>;
}) {
  const { update } = useFilters<CompanyFilterState>();
  const facets = useCompanySearchFacets(toPanelDirectoryParams(state));
  const data = result.data;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  // Sekme rozeti: aynı arama/kategoriyle kaç ÜRÜN var (tek satır yeter).
  const products = useDiscoverSearch({ q: state.q, category: state.categories[0], pageSize: 1 });

  return (
    <div className="space-y-8">
      {/* BAŞLIK + SONUÇ TÜRÜ SEKMESİ (2026-09-08, kullanıcı kararı — kaynak
          kalıp): koyu bant kalktı, ürün dizini ve kategori sayfasıyla AYNI
          düz başlık kullanılıyor. Arama kutusu burada YOK: sorgu hero'dan
          (`?q=`) ya da ürün sekmesinden taşınıyor — iki yerde iki kutu
          olmasın. */}
      <MarketHeader
        breadcrumb={[{ label: "Satınalma", href: PANEL_MARKET.home }, { label: "Tedarikçiler" }]}
        title="Tedarikçiler"
        count={data ? `${total.toLocaleString("tr-TR")} firma` : undefined}
        tabs={
          <MarketTabs
            active="companies"
            productsHref={productsHref(state)}
            companiesHref={`${PANEL_MARKET.companies}${buildCompanyFilterQuery(state)}`}
            productCount={products.data?.total}
            companyCount={data ? total : undefined}
          />
        }
      />

      {facets.data ? <CompanyActiveChips facets={facets.data} /> : null}

      <MarketListLayout
        rail={<PanelCompanyFilters idPrefix="d" />}
        toolbarStart={<ResultCount noun="firma" loading={result.isLoading} />}
        toolbarEnd={<CompanySortBar />}
        page={state.page}
        total={total}
        pageSize={pageSize}
        onPage={(page) => update({ page })}
      >
        {result.isLoading ? (
          <MarketGridSkeleton count={6} variant="company" />
        ) : !data || data.items.length === 0 ? (
          <MarketEmpty title="Bu kriterlerle firma yok." />
        ) : (
          <MarketGrid variant="company">
            {data.items.map((c) => (
              <PanelCompanyCard key={c.slug} company={c} query={state.q} />
            ))}
          </MarketGrid>
        )}
      </MarketListLayout>

      <MarketDiscoveryFooter
        cities={facets.data?.cities ?? []}
        categories={facets.data?.categories ?? []}
        cityHref={(city) => `${PANEL_MARKET.companies}?sehir=${encodeURIComponent(city)}`}
        categoryHref={(c) => panelCategoryPath(c.id, c.name)}
      />
    </div>
  );
}

/**
 * Dizin kartı + üyeye özel iki ek: bağlantı durumu rozeti ve arama varsa
 * "Aramanıza uyan" ürün şeridi (sunucu `matchedProducts` ile döner).
 */
function PanelCompanyCard({ company, query }: { company: DirectoryCompany; query?: string }) {
  const badge = STATUS_BADGE[company.connectionStatus];
  const matched = company.matchedProducts ?? [];
  return (
    <CompanyCard
      company={company}
      href={panelCompanyPath(company.rothernId ?? company.slug)}
      badge={
        badge ? (
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge.className}`}>
            {badge.label}
          </span>
        ) : undefined
      }
      footer={
        query && matched.length > 0 ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Aramanıza uyan
            </p>
            <ul className="mt-1.5 space-y-1">
              {matched.slice(0, 3).map((p) => (
                <li key={p.slug}>
                  <Link
                    href={panelProductPath(company.slug, p.slug)}
                    // Ürün YENİ SEKMEDE (kart ailesiyle aynı kural): firma
                    // listesinde gezinen alıcı ürünü açıp listeye dönmek
                    // zorunda kalmasın.
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-1 text-sm text-zinc-700 underline-offset-2 hover:text-zinc-950 hover:underline"
                  >
                    {p.name}
                    <span className="sr-only"> (yeni sekmede açılır)</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : undefined
      }
    />
  );
}
