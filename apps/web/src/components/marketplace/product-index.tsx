import { getLocale, getTranslations } from "next-intl/server";
import { FilterResults, FilterShell, MobileFilterButton, ResultCount } from "./filter-shell";
import { Pagination } from "@/components/ui/pagination";
import { ProductCard } from "./product-card";
import { MemberCta } from "./member-cta";
import { ActiveFilterChips, ProductFilters, SortControl, ViewToggle } from "./product-filters";
import { PublicEmptyState } from "./public-empty-state";
import { PublicListPage, ResultGrid } from "./public-list-page";
import { PublicSearchTabs } from "./public-search-tabs";
import { crossCounts } from "@/lib/public/cross-counts";
import { attributeSsrToVisitor } from "@/lib/public/ssr-visitor";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { fetchProductFacets, fetchProducts } from "@/lib/public/marketplace-api";
import { CityLinks } from "./city-links";
import { CountryLinks } from "./country-links";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbNode, graph, itemListNode } from "@/lib/seo/jsonld";
import { canonicalProductListPage } from "@/lib/seo/landing";
import { pageQuery } from "@/lib/seo/meta";
import { categoryHref } from "@/lib/public/marketplace";
import { cityProductPath, countryProductPath, currencyForLocale } from "@rothern/shared";
import {
  buildProductFilterQuery,
  productSearchCarry,
  parseProductFilters,
  toProductListParams,
  type SearchParamsLike,
} from "@/lib/public/product-filter-params";
import { signupHref } from "@/lib/public/visibility";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

/**
 * ÜRÜN DİZİNİ — süzgeç v3 (2026-09-04).
 *
 * Sunucu bileşeni veriyi çeker; süzgeçler İSTEMCİ (`ProductFilters`,
 * checkbox, çoklu seçim) ve durumu URL sorgusunda tutar (`filter-shell.tsx`:
 * router.replace + transition, tam sayfa yenileme yok). Kategori yol sayfası
 * (`/urunler/kategori/<kod>-<ad>`) SEO girişi; etkileşim sorgu şemasına geçer.
 * URL şeması tek kaynak: `lib/public/product-filter-params.ts`.
 */
export type ProductSearchParams = SearchParamsLike;

interface Props {
  title: string;
  lead: string;
  searchParams: SearchParamsLike;
  /**
   * Kategori yol sayfasında sabit kod. `slug` (Türkçe ad, API) ŞART: yoksa
   * adres okuyucunun dilindeki addan üretilir ve kanonikle ayrışır (EN
   * sayfalama bağlantısı 308'e düşüp `?sayfa=`yı kaybediyordu).
   */
  category?: { id: string; name: string; slug?: string };
  /** Kategori sayfası: segment fotoğrafı (başlık yanında). */
  image?: string | null;
  /** Şehir açılış sayfası: süzgeç URL'den değil YOLDAN gelir (Parça 3). */
  fixedCity?: string;
  /** Ülke sayfası (2026-09-27): satıcı ülkesi YOLDAN gelir. */
  fixedCountry?: string;
  /**
   * Şehir/ülke açılış sayfasının kırıntı zinciri ("Ürünler"den SONRAKİ
   * halkalar; İÇ yol + okuyucunun dilinde ad): ülke sayfası [Almanya], şehir
   * sayfası [Almanya, Münih]. Hem görünür kırıntı hem `BreadcrumbList`.
   */
  trail?: Array<{ name: string; path: string }>;
  /** Listenin ÜSTÜNDE görünen giriş metni (GEO: alıntılanabilir tanım). */
  /** Listenin ALTINDA görünen bağlantı şeridi (iç bağlantı ağı). */
  footer?: ReactNode;
}

export async function ProductIndex({ title, lead, searchParams, category, image, fixedCity, fixedCountry, trail, footer }: Props) {
  const t = await getTranslations("web.marketplace.index");
  const tl = await getTranslations("web.marketplace.labels");
  const tt = await getTranslations("web.marketplace.typeahead");
  const tm = await getTranslations("web.marketing");
  const locale = await getLocale();
  const state = parseProductFilters(
    {
      ...searchParams,
      ...(fixedCity ? { sehir: fixedCity } : {}),
      ...(fixedCountry ? { ulke: fixedCountry } : {}),
    },
    category?.id,
  );
  // Fiyat süzgecinin varsayılan birimi arayüz dilinden (tr TRY · ru RUB · en
  // USD) — AÇIKÇA gönderilir: uç kenar önbelleğinde, dile göre değişen örtük
  // varsayılan önbellek anahtarında görünmezdi.
  const params = toProductListParams(state, { defaultCurrency: currencyForLocale(locale) });
  const basePath = MARKETPLACE_ROUTES.products;

  // Dinamik çizim (sayfa `searchParams` okuyor): önbelleği ıskalayan çağrı API'de
  // ziyaretçi başına SSR kovasına sayılsın (derin denetim MU-12/RM-12; `ssr-visitor.ts`).
  await attributeSsrToVisitor();
  const [page, facets, otherCounts] = await Promise.all([
    fetchProducts(params),
    // Facet sayımı listeyle AYNI süzgeçleri görür (2026-09-27: ülke, "Yakınımda",
    // sertifika, çalışan ve hızlı yanıt eskiden facet çağrısına hiç gitmiyordu).
    fetchProductFacets({
      category: params.category,
      q: params.q,
      city: params.city,
      country: params.country,
      activity: params.activity,
      verified: params.verified,
      price: params.price,
      cert: params.cert,
      employees: params.employees,
      near: params.near,
      radius: params.radius,
      fastReply: params.fastReply,
      currency: params.currency,
    }),
    // Sekme rozetleri: aynı sorgunun ÖTEKİ yüzeylerdeki toplamı
    // (yalnız arama varken istek atılır).
    crossCounts(state.q, "products"),
  ]);
  /* AÇILIŞ SAYFASI YOLU (2026-09-27 SEO denetimi): kategori/şehir/ülke
     sayfasının kanonik İÇ yolu. Sayfalama ve JSON-LD buradan okur — eskiden
     şehir sayfasının 2. sayfası `/urunler?sehir=…&sayfa=2` idi (kanoniği
     `/urunler`), ItemList adresi de `/urunler` yazıyordu. Yoldan gelen süzgeç
     sorguya YAZILMAZ (yol zaten taşıyor). */
  const landingPath = category
    ? categoryHref(category)
    : fixedCity
      ? cityProductPath(fixedCity)
      : fixedCountry
        ? countryProductPath(fixedCountry)
        : basePath;
  const landingQuery = (p: number) =>
    buildProductFilterQuery({
      ...state,
      category: category ? undefined : state.category,
      cities: fixedCity ? state.cities.filter((c) => c !== fixedCity) : state.cities,
      countries: fixedCountry ? state.countries.filter((c) => c !== fixedCountry) : state.countries,
      page: p,
    });
  const crumbs = category ? [{ name: category.name, path: landingPath }] : (trail ?? []);
  const hasFilter = buildProductFilterQuery({ ...state, q: undefined, sort: undefined, page: 1 }) !== "";
  // Misafir kaydı DÖNÜŞ ADRESİ TAŞIMAZ (Y-03): yeni firma STANDART doğar,
  // satınalma sihirbazı Gold ister. Oturumlu üyeye kapıyı `MemberCta` söyler.
  const talepHref = signupHref("talep");
  const panelTalepHref = `/company/satinalma/taleplerim/yeni${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`;
  const floatCls =
    "fixed right-5 bottom-5 z-30 inline-flex items-center gap-1 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700";

  /* ITEMLIST (2026-09-09, Parça 2): liste sayfası onsuz motorlar için
     "bir sürü bağlantı"dır — ne listelediğini söylemez. Sıra numarası
     SAYFALAMAYI yansıtır (2. sayfa 13'ten devam eder), yoksa her sayfa
     "1..12" der ve aynı sıralı liste tekrarlanmış görünür.
     Kanonik yol açılış sayfasında (kategori/şehir/ülke) o sayfaya, dizinde
     köke işaret eder — süzgeçli varyantlar kanoniğini `/urunler` bildiriyor.
     Sayfalanmış sayfa (yalnız `?sayfa=N`) kendi adresini söyler — sayfa
     metasındaki kanonikle aynı kural (`canonicalProductListPage`).
     Adresler sayfanın dilinde (`locale`). */
  const listPage = canonicalProductListPage(searchParams);
  const listLd = graph([
    itemListNode({
      locale,
      name: title,
      path: `${landingPath}${pageQuery(listPage)}`,
      totalItems: page.total,
      startPosition: (page.page - 1) * page.pageSize + 1,
      items: page.items.map((p) => ({
        name: p.name,
        path: `/firma/${p.company.slug}/urun/${p.slug}`,
      })),
    }),
    ...(crumbs.length
      ? [
          breadcrumbNode(
            [
              { name: tm("breadcrumbHome"), path: "/" },
              { name: tl("products"), path: basePath },
              ...crumbs,
            ],
            locale,
          ),
        ]
      : []),
  ]);

  return (
    <>
    <JsonLd data={listLd} />
    {/* Giriş paragrafı (kategori/şehir özeti) KALDIRILDI — 2026-09-24,
        kullanıcı: "rothern header alt kısmındaki bilgiyi kaldır, diğer tüm
        dillerde de". Özet cümle JSON-LD `ItemList` ve meta açıklamasında
        yaşamaya devam eder; sayfada tekrar çizilmez. */}
    <FilterShell basePath={basePath} fixedCategory={category?.id} fixedCity={fixedCity} fixedCountry={fixedCountry} total={page.total} pushFilters drawer={<ProductFilters facets={facets} idPrefix="m" />}>
      <PublicListPage
          tabs={
            <PublicSearchTabs active="products" q={state.q} counts={{ ...otherCounts, products: page.total }} />
          }
        title={title}
        lead={lead}
        image={image}
        breadcrumb={
          crumbs.length ? (
            <nav aria-label={t("breadcrumb")} className="mb-3 text-sm text-zinc-500">
              <Link href={basePath} className="hover:text-zinc-900">{tl("products")}</Link>
              {crumbs.map((c, i) => (
                <span key={c.path}>
                  <span aria-hidden className="mx-2">/</span>
                  {i === crumbs.length - 1 ? (
                    <span className="text-zinc-900">{c.name}</span>
                  ) : (
                    <Link href={c.path} className="hover:text-zinc-900">{c.name}</Link>
                  )}
                </span>
              ))}
            </nav>
          ) : undefined
        }
        search={{
          action: basePath,
          defaultValue: state.q,
          hiddenList: productSearchCarry(state),
          placeholder: tt("productsPlaceholder"),
        }}
        chips={[]}
        clearHref={basePath}
        chipsNode={<ActiveFilterChips facets={facets} />}
        sidebar={<ProductFilters facets={facets} idPrefix="d" />}
        summary={
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount kind="product" />
            </span>
            <span className="flex items-center gap-2">
              <SortControl />
              <ViewToggle />
            </span>
          </span>
        }
      >
        <FilterResults>
          {page.items.length === 0 ? (
            <PublicEmptyState
              title={t("productsEmptyTitle")}
              clearHref={hasFilter || category ? basePath : undefined}
              extra={{ label: t("openRequestCta"), href: talepHref }}
            />
          ) : (
            <ResultGrid
              count={page.items.length}
              heading={t("productResults")}
              layout={state.view === "liste" ? "list" : "grid"}
            >
              {page.items.map((p, i) => (
                <ProductCard
                  variant={state.view === "liste" ? "wide" : "tile"}
                  key={`${p.company.slug}/${p.slug}`}
                  companySlug={p.company.slug}
                  company={p.company}
                  product={p}
                  cta={t("inquire")}
                  compare
                  priority={i < 3}
                />
              ))}
            </ResultGrid>
          )}
        </FilterResults>
        <Pagination
          page={page.page}
          total={page.total}
          pageSize={page.pageSize}
          className="mt-10 border-t border-zinc-950/5 pt-6"
          // Açılış sayfasında (kategori/şehir/ülke) KANONİK yol korunur, sorgu
          // yoldaki süzgeci taşımaz (`landingQuery`); 7 yuva, gerçek bağlantılar
          // (bot izler, rel=prev/next). Kategoride eskiden çıplak kod
          // (`/urunler/kategori/<kod>`) yazılıyordu → sayfa kanoniğe 308'leyip
          // `?sayfa=` düşürüyordu (2. sayfa 1. sayfayı açıyordu).
          hrefBuilder={(p) => `${landingPath}${landingQuery(p)}`}
        />
        {/* Yüzen "Talep aç" — listeyi gezen alıcı için; hero'lu sayfa değil. */}
        <MemberCta
          action="listing"
          compact
          compactClassName={floatCls}
          compactLabel={t("openRequest")}
          member={
            <Link href={panelTalepHref} className={floatCls}>
              {t("openRequest")}
            </Link>
          }
        >
          <Link href={talepHref} className={floatCls}>
            {t("openRequest")}
          </Link>
        </MemberCta>
      </PublicListPage>
    </FilterShell>
    {/* Şehir şeridi VARSAYILAN (2026-09-09, Parça 3): şehir sayfalarına iç
        bağlantı olmadan sitemap tek başına otorite aktarmaz. Şehir sayfası
        kendi şeridini `footer` ile verir (orada facet, o şehre daralmış
        olurdu ve şerit boş çıkardı). */}
    {footer ?? (
      <>
        <CityLinks cities={facets.cities} kind="products" activeCity={fixedCity} />
        <CountryLinks countries={facets.countries} activeCountry={fixedCountry} />
      </>
    )}
    </>
  );
}
