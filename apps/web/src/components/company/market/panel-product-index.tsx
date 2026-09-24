"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNavLabel } from "@/i18n/domain";
import { formatNumber } from "@/i18n/format";
import { FilterShell, ResultCount, useFilters } from "@/components/marketplace/filter-shell";
import { ProductCard } from "@/components/marketplace/product-card";
import {
  ActiveFilterChips,
  ProductFilters,
  SortControl,
  ViewPreferenceSync,
  ViewToggle,
} from "@/components/marketplace/product-filters";
import { useDiscoverProductFacets, useDiscoverSearch } from "@/hooks/use-portal-discovery";
import { useCompanySearch } from "@/hooks/use-company-directory";
import {
  buildProductFilterQuery,
  parseProductFilters,
  toProductListParams,
  type PerPage,
  type ProductFilterState,
} from "@/lib/public/product-filter-params";
import { PANEL_MARKET, panelCategoryPath, panelProductPath } from "@/lib/company/panel-market";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import type { ProductFacets } from "@/lib/public/marketplace-api";
import type { ReactNode } from "react";
import { MarketHeader, MarketTabs } from "./market-band";
import { MarketEmpty, MarketGrid, MarketGridSkeleton, MarketList, MarketListLayout } from "./market-list-layout";
import { MarketDiscoveryFooter } from "./market-discovery-footer";

/**
 * Ürün süzgecinden FİRMA dizini adresi — arama ve kategori taşınır
 * (`kategori` iki şemada da aynı ad; `company-filter-params` okuyor).
 * Diğer süzgeçler (fiyat, MOQ, nitelik) firma dizininde karşılıksız,
 * taşınmaz — taşısaydık orada sessizce düşer, kullanıcı "süzgecim kayboldu"
 * derdi.
 */
function companiesHref(state: ProductFilterState): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.category) sp.set("kategori", state.category);
  const qs = sp.toString();
  return `${PANEL_MARKET.companies}${qs ? `?${qs}` : ""}`;
}

/** Varsayılan sayfa boyutu — `adet` ile 24/48/96 arasında değişir. */
const DEFAULT_PER_PAGE: PerPage = 24;

/**
 * PANEL ÜRÜN DİZİNİ — kendi adresi olan tam liste (`/company/satinalma/urunler`).
 *
 * 2026-09-05'te bu liste anasayfaya gömülmüştü; pazar katmanı brifiyle geri
 * kendi sayfasına alındı. Gerekçe kullanıcının canlı incelemesi: anasayfa
 * hem panel hem pazar olmaya çalışınca ikisi de okunmuyordu ve kategori
 * kartına tıklamak URL'yi değiştirmediği için filtrelenmiş liste
 * paylaşılamıyordu. Anasayfa artık pazar GİRİŞİ (arama + kategoriler + öne
 * çıkanlar), liste burada.
 *
 * Herkese açık `/urunler` ile AYNI süzgeç bileşeni, AYNI URL şeması ve AYNI
 * sunucu kuralı; fark üyeye özel olanlar: kendi ürünler hariç, alıcıya göre
 * uygunluk sırası (kartta rozet) ve fiyat/MOQ görünür.
 */
export function PanelProductIndex({
  fixedCategory,
  banner,
  band,
  footer = true,
}: {
  /** Kategori sayfasından gelen kod — süzgeç yolda sabit. */
  fixedCategory?: string;
  /** AI arama bandı ("AI şöyle anladı" + çipler). */
  banner?: ReactNode;
  /**
   * Sayfaya özel başlık bandı; verilmezse ürün dizininin standart bandı.
   * Facet yanıtı da geçilir — kategori sayfası alt kırılım çiplerini AYNI
   * istekten okusun (ikinci bir `useDiscoverProductFacets` çağrısı farklı
   * anahtar üretip aynı veriyi iki kez indirirdi).
   */
  band?: (ctx: { total: number; loaded: boolean; facets?: ProductFacets }) => ReactNode;
  footer?: boolean;
}) {
  const sp = useSearchParams();
  const state = parseProductFilters(sp ?? new URLSearchParams(), fixedCategory);
  const params = toProductListParams(state);
  const result = useDiscoverSearch({ ...params, pageSize: state.perPage ?? DEFAULT_PER_PAGE });
  const total = result.data?.total ?? 0;
  return (
    <FilterShell
      basePath={PANEL_MARKET.products}
      fixedCategory={fixedCategory}
      total={total}
      drawer={<PanelProductFilters idPrefix="m" />}
      drawerHideAt="xl"
      /* Satınalma panelinde birincil renk MAVİ (kullanıcı kararı): kutucuk,
         fiyat çipi, yarıçap kaydırıcısı ve mobil "Sonuçları göster" düğmesi
         siyah kalmasın. Herkese açık `/urunler` monokrom kalır. */
      accent="blue"
      pushFilters
    >
      <Inner state={state} result={result} banner={banner} band={band} footer={footer} />
    </FilterShell>
  );
}

export function PanelProductFilters({ idPrefix }: { idPrefix: string }) {
  const t = useTranslations("web.panel.market.panelProductIndex");
  const { state } = useFilters();
  const p = toProductListParams(state);
  const facets = useDiscoverProductFacets({
    category: p.category,
    q: p.q,
    city: p.city,
    activity: p.activity,
    verified: p.verified,
    price: p.price,
  });
  if (!facets.data) return <p className="text-sm text-zinc-500">{t("suzgeclerYukleniyor")}</p>;
  return <ProductFilters facets={facets.data} idPrefix={idPrefix} />;
}

function Inner({
  state,
  result,
  banner,
  band,
  footer,
}: {
  state: ProductFilterState;
  result: ReturnType<typeof useDiscoverSearch>;
  banner?: ReactNode;
  band?: (ctx: { total: number; loaded: boolean; facets?: ProductFacets }) => ReactNode;
  footer: boolean;
}) {
  const t = useTranslations("web.panel.market.panelProductIndex");
  const tn = useNavLabel();
  const locale = useLocale();
  const { update } = useFilters<ProductFilterState>();
  const p = toProductListParams(state);
  const facets = useDiscoverProductFacets({
    category: p.category,
    q: p.q,
    city: p.city,
    activity: p.activity,
    verified: p.verified,
    price: p.price,
  });
  const data = result.data;
  const total = data?.total ?? 0;
  /* SEKME ROZETİ: aynı arama/kategoriyle KAÇ TEDARİKÇİ var. Alıcı bazen
     ürünü değil ÜRETİCİYİ arıyor; sayıyı tıklamadan görmeli. Sorgu ucuz ve
     react-query önbelleğinde firma dizininkiyle paylaşılıyor. */
  const companies = useCompanySearch({ q: state.q, category: state.category });
  const pageSize = data?.pageSize ?? state.perPage ?? DEFAULT_PER_PAGE;
  const talepHref = `/company/satinalma/taleplerim/yeni${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`;
  // Izgara ↔ liste: aynı kartlar, farklı yoğunluk (`gorunum` URL'de).
  const Wrap = state.view === "liste" ? MarketList : MarketGrid;

  return (
    <div className="space-y-8">
      {band ? (
        band({ total, loaded: !!data, facets: facets.data })
      ) : (
        <MarketHeader
          breadcrumb={[{ label: tn("portal.satinalma"), href: PANEL_MARKET.home }, { label: tn("satinalma.urunler") }]}
          title={tn("satinalma.urunler")}
          count={data ? t("urun", { n: formatNumber(total, locale) }) : undefined}
          tabs={
            <MarketTabs
              active="products"
              productsHref={`${PANEL_MARKET.products}${buildProductFilterQuery(state)}`}
              companiesHref={companiesHref(state)}
              productCount={data ? total : undefined}
              companyCount={companies.data?.total}
            />
          }
        />
      )}

      {banner}
      {/* Kayıtlı ızgara/liste tercihini URL'e taşır (çizim üretmez). */}
      <ViewPreferenceSync />
      {facets.data ? <ActiveFilterChips facets={facets.data} /> : null}

      <MarketListLayout
        rail={<PanelProductFilters idPrefix="d" />}
        toolbarStart={
          /* Sayı BAŞLIKTA yazılı (MarketHeader `count`); burada yalnız canlı
             bölge ve "Güncelleniyor…" kalır (`quiet`). */
          <ResultCount noun={t("urun2")} loading={result.isLoading} quiet />
        }
        toolbarEnd={
          <span className="flex items-center gap-2">
            <SortControl />
            <ViewToggle />
          </span>
        }
        page={state.page}
        total={total}
        pageSize={pageSize}
        perPage={state.perPage ?? DEFAULT_PER_PAGE}
        onPage={(page) => update({ page })}
        onPerPage={(perPage) => update({ perPage })}
      >
        {result.isLoading ? (
          <MarketGridSkeleton />
        ) : !data || data.items.length === 0 ? (
          <MarketEmpty
            title={t("buKriterlerleUrunYok")}
            action={
              <Link
                href={talepHref}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
              >
                {t("talepAcTedarikcilerTeklifVersin")}
              </Link>
            }
          />
        ) : (
          <Wrap>
            {data.items.map((item, i) => (
              <ProductCard
                variant={state.view === "liste" ? "wide" : "tile"}
                key={`${item.company.slug}/${item.slug}`}
                product={item}
                company={item.company}
                href={panelProductPath(item.company.slug, item.slug)}
                features={item.features}
                cta={t("bilgiIste")}
                accent="blue"
                compare
                priority={i < 3}
                badge={
                  item.matchesProfile ? (
                    <span className="inline-flex items-center rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200">
                      {t("alimKategorinizleEslesiyor")}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </Wrap>
        )}
      </MarketListLayout>

      {footer ? (
        <MarketDiscoveryFooter
          cities={facets.data?.cities ?? []}
          categories={facets.data?.categories ?? []}
          cityHref={(city) => `${PANEL_MARKET.products}?sehir=${encodeURIComponent(city)}`}
          categoryHref={(c) => panelCategoryPath(c.id, c.name)}
        />
      ) : null}
    </div>
  );
}
