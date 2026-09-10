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
import {
  PANEL_MARKET,
  SELLER_MARKET,
  marketCompaniesPath,
  panelCategoryPath,
  panelCompanyPath,
  panelProductPath,
} from "@/lib/company/panel-market";
import type { PortalKey } from "@/lib/company/portals";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketHeader, MarketTabs } from "./market-band";
import { MarketEmpty, MarketGridSkeleton, MarketListLayout } from "./market-list-layout";
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
export function PanelCompanyIndex({ portal = "satinalma" }: { portal?: PortalKey }) {
  const sp = useSearchParams();
  const state = parseCompanyFilters(sp ?? new URLSearchParams());
  const params = toPanelDirectoryParams(state);
  const result = useCompanySearch(params);
  const total = result.data?.total ?? 0;
  const base = marketCompaniesPath(portal);
  return (
    <FilterShellCore
      state={state}
      toUrl={(next) => `${base}${buildCompanyFilterQuery(next)}`}
      clearState={clearCompanyFilters}
      total={total}
      activeCount={activeCompanyFilterCount(state)}
      drawer={<PanelCompanyFilters idPrefix="m" />}
      drawerHideAt="xl"
      /* Renk çağırandan gelir: satınalma MAVİ, satış portalı SİYAH/emerald
         (monokrom süzgeç). Bileşen portal bilmez, yalnız rengi alır. */
      accent={portal === "satis" ? "default" : "blue"}
    >
      <Inner state={state} result={result} portal={portal} />
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
  portal,
}: {
  state: CompanyFilterState;
  result: ReturnType<typeof useCompanySearch>;
  portal: PortalKey;
}) {
  const { update } = useFilters<CompanyFilterState>();
  const facets = useCompanySearchFacets(toPanelDirectoryParams(state));
  const data = result.data;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const isSatis = portal === "satis";
  const base = marketCompaniesPath(portal);
  // Sekme rozeti: aynı arama/kategoriyle kaç ÜRÜN var (tek satır yeter).
  // Satışta ürün dizini yok → sekme çizilmez, sayı sorulmaz.
  const products = useDiscoverSearch({ q: state.q, category: state.categories[0], pageSize: 1 }, { enabled: !isSatis });

  return (
    <div className="space-y-8">
      {/* BAŞLIK + SONUÇ TÜRÜ SEKMESİ (2026-09-08, kullanıcı kararı — kaynak
          kalıp): koyu bant kalktı, ürün dizini ve kategori sayfasıyla AYNI
          düz başlık kullanılıyor. Arama kutusu burada YOK: sorgu hero'dan
          (`?q=`) ya da ürün sekmesinden taşınıyor — iki yerde iki kutu
          olmasın. */}
      {/* İki portalda da "Firmalar" (2026-09-10, kullanıcı kararı —
          satınalmadaki "Tedarikçiler" de kalktı): dizin herkesi listeler.
          Satışta sekme yok (ürün dizini satışta yaşamıyor); ekmek kırıntısı
          portal rengini almaz. */}
      <MarketHeader
        accent={isSatis ? "default" : "blue"}
        breadcrumb={
          isSatis
            ? [{ label: "Satış", href: SELLER_MARKET.home }, { label: "Firmalar" }]
            : [{ label: "Satınalma", href: PANEL_MARKET.home }, { label: "Firmalar" }]
        }
        title="Firmalar"
        lead={isSatis ? "Alıcı olabilecek firmaları bulun; bağlantı isteği ve mesaj firma sayfasında." : undefined}
        count={data ? `${total.toLocaleString("tr-TR")} firma` : undefined}
        tabs={
          isSatis ? undefined : (
            <MarketTabs
              active="companies"
              productsHref={productsHref(state)}
              companiesHref={`${base}${buildCompanyFilterQuery(state)}`}
              productCount={products.data?.total}
              companyCount={data ? total : undefined}
            />
          )
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
          /* YATAY LİSTE (2026-09-08, kullanıcı kararı: "kare kare değil,
             yatay birer birer"): firma dizini bir DEĞERLENDİRME ekranı —
             üç sütunlu ızgarada ana kategoriler, açıklama ve ürün şeridi
             sıkışıyordu. Ürün dizini ızgara kalır (tarama ekranı). */
          <ul className="space-y-4">
            {data.items.map((c) => (
              <li key={c.slug}>
                <PanelCompanyCard company={c} query={state.q} portal={portal} />
              </li>
            ))}
          </ul>
        )}
      </MarketListLayout>

      <MarketDiscoveryFooter
        cities={facets.data?.cities ?? []}
        categories={facets.data?.categories ?? []}
        cityHref={(city) => `${base}?sehir=${encodeURIComponent(city)}`}
        /* Kategori: satınalmada kategori SAYFASI kanonik; satışta o sayfa
           yok → aynı dizin kategori süzgeciyle. */
        categoryHref={(c) => (isSatis ? `${base}?kategori=${c.id}` : panelCategoryPath(c.id, c.name))}
      />
    </div>
  );
}

/**
 * Dizin kartı + üyeye özel iki ek: bağlantı durumu rozeti ve arama varsa
 * "Aramanıza uyan" ürün şeridi (sunucu `matchedProducts` ile döner).
 */
export function PanelCompanyCard({
  company,
  query,
  portal,
}: {
  company: DirectoryCompany;
  query?: string;
  portal: PortalKey;
}) {
  const badge = STATUS_BADGE[company.connectionStatus];
  // "Aramanıza uyan" ürün şeridi ürün detayına (satınalma pazarı) bağlanır;
  // satışta o rota yok ve satıcı ürün DEĞİL alıcı arıyor → şerit çizilmez.
  const matched = portal === "satis" ? [] : (company.matchedProducts ?? []);
  return (
    <CompanyCard
      variant="wide"
      company={company}
      href={panelCompanyPath(company.rothernId ?? company.slug)}
      /* Birincil eylem firmanın PANEL sayfası: bağlantı isteği ve mesaj
         orada yaşıyor — kartta ayrı bir "iletişim" akışı yok. */
      cta={{ label: "İletişime geçin", href: panelCompanyPath(company.rothernId ?? company.slug) }}
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
