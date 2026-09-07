"use client";

import { FilterShellCore, ResultCount, useFilters } from "@/components/marketplace/filter-shell";
import { CompanyActiveChips, CompanyFilters, CompanySortBar } from "@/components/marketplace/company-filters";
import { CompanyCard } from "@/components/marketplace/company-card";
import { useCompanySearch, useCompanySearchFacets, type DirectoryCompany } from "@/hooks/use-company-directory";
import {
  activeCompanyFilterCount,
  buildCompanyFilterQuery,
  clearCompanyFilters,
  parseCompanyFilters,
  toPanelDirectoryParams,
  type CompanyFilterState,
} from "@/lib/public/company-filter-params";
import { PANEL_MARKET, panelCategoryPath, panelCompanyPath, panelProductPath } from "@/lib/company/panel-market";
import { useSearchParams } from "next/navigation";
import { MarketBand, MarketTabs } from "./market-band";
import { MarketSearch } from "./market-search";
import { MarketEmpty, MarketGrid, MarketGridSkeleton, MarketListLayout } from "./market-list-layout";
import { MarketDiscoveryFooter } from "./market-discovery-footer";

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

  return (
    <div className="space-y-8">
      <MarketBand
        breadcrumb={[{ label: "Satınalma", href: PANEL_MARKET.home }, { label: "Firmalar" }]}
        title="Firmalar"
        lead="Vitrini yayında olan tedarikçiler. Sektör, şehir ve faaliyet tipine göre süzün; bağlantı kurun ya da doğrudan teklif isteyin."
        search={<MarketSearch<CompanyFilterState> placeholder="Firma adı, sektör ya da ürün ara" />}
        tabs={
          <MarketTabs
            active="companies"
            productsHref={`${PANEL_MARKET.products}${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`}
            companiesHref={`${PANEL_MARKET.companies}${buildCompanyFilterQuery(state)}`}
            companyCount={total}
          />
        }
      />

      {facets.data ? <CompanyActiveChips facets={facets.data} /> : null}

      <MarketListLayout
        rail={<PanelCompanyFilters idPrefix="d" />}
        toolbarStart={<ResultCount noun="firma" />}
        toolbarEnd={<CompanySortBar />}
        page={state.page}
        total={total}
        pageSize={pageSize}
        onPage={(page) => update({ page })}
      >
        {result.isLoading ? (
          <MarketGridSkeleton count={6} />
        ) : !data || data.items.length === 0 ? (
          <MarketEmpty title="Bu kriterlerle firma yok." />
        ) : (
          <MarketGrid>
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
    <div className="flex flex-col gap-0">
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
      />
      {query && matched.length > 0 ? (
        <div className="-mt-px rounded-b-xl border border-t-0 border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Aramanıza uyan
          </p>
          <ul className="mt-2 space-y-1">
            {matched.slice(0, 3).map((p) => (
              <li key={p.slug}>
                <a
                  href={panelProductPath(company.slug, p.slug)}
                  className="line-clamp-1 text-sm text-zinc-700 underline-offset-2 hover:text-zinc-950 hover:underline"
                >
                  {p.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
