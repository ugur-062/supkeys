"use client";

import { useTranslations } from "next-intl";
import { useNavLabel } from "@/i18n/domain";
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
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import {
  buildProductFilterQuery,
  parseProductFilters,
  toProductFacetParams,
  toProductListParams,
  type PerPage,
  type ProductFilterState,
} from "@/lib/public/product-filter-params";
import {
  buildCompanyFilterQuery,
  EMPTY_COMPANY_FILTERS,
  toPanelDirectoryParams,
  type CompanyFilterState,
} from "@/lib/public/company-filter-params";
import { pastEndLastPage } from "@/lib/public/filter-param-utils";
import { PANEL_MARKET, panelCategoryPath, panelProductPath } from "@/lib/company/panel-market";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import type { ProductFacets } from "@/lib/public/marketplace-api";
import type { ReactNode } from "react";
import { MarketHeader, MarketTabs } from "./market-band";
import {
  MarketEmpty,
  MarketFiltersPlaceholder,
  MarketGrid,
  MarketGridSkeleton,
  MarketList,
  MarketListLayout,
} from "./market-list-layout";
import { ErrorState } from "@/components/ui/error-state";
import { MarketDiscoveryFooter } from "./market-discovery-footer";

/**
 * Ürün süzgecinin FİRMA dizininde karşılığı olan kısmı: arama, kategori ve
 * satıcı firmaya ait süzgeçler (şehir, ülke, faaliyet, doğrulanmış). Ürün
 * dizini bu süzgeçleri zaten FİRMA alanından uygular (API `product-index`
 * `company.cityId/country/activities/companyVerificationStatus`), firma
 * dizini aynı adlarla okur (`company-filter-params`). Sekme rozeti ve sekme
 * adresi BU durumdan üretilir — "0 ürün" yanında "Firmalar 3" yazıp geçişte
 * şehri sessizce düşürmesin (arayüz testi webA-12 yeniden doğrulama).
 * Karşılığı olmayanlar (fiyat, MOQ, nitelik, yakınlık) taşınmaz — taşısaydık
 * orada sessizce düşer, kullanıcı "süzgecim kayboldu" derdi.
 */
export function companyFiltersOf(state: ProductFilterState): CompanyFilterState {
  return {
    ...EMPTY_COMPANY_FILTERS,
    q: state.q,
    cities: state.cities,
    countries: state.countries,
    activities: state.activities,
    categories: state.category ? [state.category] : [],
    verified: state.verified,
  };
}

function companiesHref(state: ProductFilterState): string {
  return `${PANEL_MARKET.companies}${buildCompanyFilterQuery(companyFiltersOf(state))}`;
}

/**
 * Sayfaya özel bandın gördüğü bağlam. Sekme rozetleri ve sekme adresleri
 * standart bantla AYNI kaynaktan (arayüz testi D-236): kategori sayfasında
 * "Firmalar" sekmesi sayısızdı, etkin sekmenin adresi süzgeçleri düşürüyordu.
 */
export interface PanelBandContext {
  total: number;
  loaded: boolean;
  facets?: ProductFacets;
  /** Aynı arama/kategorideki tedarikçi sayısı (yüklenene dek `undefined`). */
  companyCount?: number;
  /** Etkin süzgeçlerle firma dizini adresi (arama, kategori ve firma süzgeçleri — `companyFiltersOf`). */
  companiesHref: string;
  /** Geçerli süzgeç durumu — etkin sekmenin adresi süzgeçleri korusun. */
  state: ProductFilterState;
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
 *
 * LİSTE DURUMLARI (canlı doğrulama 2026-10-09, OUTR-3): "Bu kriterlerle ürün
 * yok" yalnız BAŞARILI ve boş yanıtta. Yanıt yokken (`isPending` — çevrimdışı
 * duraklama dahil) iskelet; istek düştü ve eldeki veri de yoksa hata kartı +
 * "Tekrar dene" (eskiden kesintide "ürün yok" + "Talep aç" düğmesi çıkıyordu).
 * Okunamayan toplam kabuğa `null` gider: "Ürün bulunamadı" ve "(0)" çizilmez.
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
  band?: (ctx: PanelBandContext) => ReactNode;
  footer?: boolean;
}) {
  const sp = useSearchParams();
  const state = parseProductFilters(sp ?? new URLSearchParams(), fixedCategory);
  const params = toProductListParams(state);
  const result = useDiscoverSearch({ ...params, pageSize: state.perPage ?? DEFAULT_PER_PAGE });
  const total = result.data ? result.data.total : null;
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
  // Sayaçlar listeyle AYNI süzgeçleri görür (arayüz testi O-080); histogram
  // birimi seçilmediyse sunucu firma ülkesinden çözer.
  const facets = useDiscoverProductFacets(toProductFacetParams(p));
  if (!facets.data) {
    return (
      <MarketFiltersPlaceholder
        failed={facets.isError}
        onRetry={() => void facets.refetch()}
        loadingLabel={t("suzgeclerYukleniyor")}
      />
    );
  }
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
  band?: (ctx: PanelBandContext) => ReactNode;
  footer: boolean;
}) {
  const t = useTranslations("web.panel.market.panelProductIndex");
  const te = useTranslations("web.marketplace.empty");
  const tn = useNavLabel();
  const { update } = useFilters<ProductFilterState>();
  const p = toProductListParams(state);
  const facets = useDiscoverProductFacets(toProductFacetParams(p));
  const data = result.data;
  // İstek düştü ve gösterilecek veri yok. Verisi olan listenin arka plan
  // yenilemesi düşerse satırlar kalır (`data` dolu).
  const failed = data === undefined && result.isError;
  // Yalnız sayfalama hesabı ve `data` varken çizilen başlık / rozet için;
  // okunamayan toplam hiçbir yerde sayı olarak görünmez.
  const total = data?.total ?? 0;
  /* SEKME ROZETİ: aynı arama/kategori VE firma süzgeçleriyle (şehir, ülke,
     faaliyet, doğrulanmış) KAÇ TEDARİKÇİ var — sekmenin götürdüğü listeyle
     AYNI sayı. Alıcı bazen ürünü değil ÜRETİCİYİ arıyor; sayıyı tıklamadan
     görmeli. Sorgu ucuz ve react-query önbelleğinde firma dizininkiyle
     paylaşılıyor (aynı parametre dönüşümü). */
  const companies = useCompanySearch(toPanelDirectoryParams(companyFiltersOf(state)));
  const pageSize = data?.pageSize ?? state.perPage ?? DEFAULT_PER_PAGE;
  /* SON SAYFANIN ÖTESİ (arayüz testi son tur webA-2): `?sayfa=9` son sayfadan
     büyükse uç boş liste + dolu toplam döner. "Bu kriterlerle ürün yok"
     başlıktaki "169 ürün" ile çelişirdi — kriterler eşleşiyor, yalnız bu sayfa
     boş. Herkese açık dizinlerle aynı kural (`pastEndLastPage`, webA-05 NEW-2);
     panel ucu sayfa tavanı koymaz. */
  const lastPage = data
    ? pastEndLastPage({ itemCount: data.items.length, total: data.total, page: data.page ?? state.page, pageSize })
    : null;
  const talepHref = `/company/satinalma/taleplerim/yeni${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`;
  // Eylem düğmeleri İZNE bağlı (arayüz testi O-079, D-038): sayfayı buy:view
  // açar ama talep açmak buy:listing:manage, bilgi istemek buy:inquiry:send
  // ister — Yönetici/görüntüleyici düğmeye basıp "yetki gerekir" sayfasına
  // düşüyordu. Paket zaten Gold (satınalma kabuğu).
  const canOpenRequest = useHasCompanyPermission("buy:listing:manage");
  const canInquire = useHasCompanyPermission("buy:inquiry:send");
  // Izgara ↔ liste: aynı kartlar, farklı yoğunluk (`gorunum` URL'de).
  const Wrap = state.view === "liste" ? MarketList : MarketGrid;

  return (
    <div className="space-y-8">
      {band ? (
        band({
          total,
          loaded: !!data,
          facets: facets.data,
          companyCount: companies.data?.total,
          companiesHref: companiesHref(state),
          state,
        })
      ) : (
        <MarketHeader
          breadcrumb={[{ label: tn("portal.satinalma"), href: PANEL_MARKET.home }, { label: tn("satinalma.urunler") }]}
          title={tn("satinalma.urunler")}
          count={data ? t("urun", { n: total }) : undefined}
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
          <ResultCount kind="product" loading={result.isPending} quiet />
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
        {result.isPending ? (
          <MarketGridSkeleton />
        ) : failed ? (
          <ErrorState onRetry={() => void result.refetch()} />
        ) : lastPage != null ? (
          <MarketEmpty
            title={te("pageEmpty")}
            action={
              <button
                type="button"
                onClick={() => update({ page: lastPage })}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
              >
                {te("lastPage")}
              </button>
            }
          />
        ) : !data || data.items.length === 0 ? (
          <MarketEmpty
            title={t("buKriterlerleUrunYok")}
            action={
              canOpenRequest ? (
                <Link
                  href={talepHref}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
                >
                  {t("talepAcTedarikcilerTeklifVersin")}
                </Link>
              ) : undefined
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
                cta={canInquire ? t("bilgiIste") : undefined}
                accent="blue"
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
