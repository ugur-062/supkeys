import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams } from "@/i18n/params";
import { localizedCountrySlug, type Locale } from "@rothern/i18n";
import { countryCodeFromSlug, countryProductPath } from "@rothern/shared";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { CityLinks } from "@/components/marketplace/city-links";
import { CountryLinks } from "@/components/marketplace/country-links";
import { ProductIndex, type ProductSearchParams } from "@/components/marketplace/product-index";
import { fetchProductFacets, fetchProducts } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { countryDisplayName } from "@/i18n/domain";
import { canonicalProductListPage, landingIndexable, queryStringOf } from "@/lib/seo/landing";
import { buildMetadata, ogCardPath } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { permanentRedirect } from "@/i18n/navigation";

/**
 * ÜLKE AÇILIŞ SAYFASI — ÜRÜNLER (2026-09-27, kullanıcı: "bu uluslararası bir
 * sistem"). "Turkish suppliers", "поставщики из Турции", "German machinery
 * suppliers" tipi aramaların karşılığı: satıcı ülkesine göre ürünler, kendi
 * adresi/başlığı/kanoniği ile. Şehir sayfasıyla aynı kalıp: boş ülke 404 DEĞİL
 * `noindex`; eşiğin (`MIN_LANDING_PRODUCTS`) altındaki ülke de `noindex` ve
 * sitemap'e girmez (ince içerik, 2026-09-27).
 *
 * Adres `<kod>-<ad>`, ad OKUYUCUNUN DİLİNDE ("de-almanya" · "de-germany" ·
 * "de-germaniya", `@rothern/i18n` `country-slugs.ts`) — kod ÖNDE (slug kuralı);
 * ad kısmı başka dilde/eski biçimde gelse de kod çözülür ve kanoniğe 308
 * (sorgu dizesi — `?sayfa=` — korunur).
 */
export const revalidate = 600;

type Params = Promise<{ locale: string; ulke: string }>;

/**
 * Ülkedeki ürün SAYISI — liste ucunun `total`ı (bkz. şehir sayfası
 * `cityProductCount`: facet sayacı ilk 5.000 ürünle sınırlı, sırasız).
 */
async function countryProductCount(cc: string): Promise<number> {
  return (await fetchProducts({ country: cc })).total;
}

async function countryOr404(ulke: string, locale: Locale, query: string) {
  const cc = countryCodeFromSlug(ulke);
  if (!cc) notFound();
  // İç yol Türkçe biçimdir; `permanentRedirect` sarmalayıcısı onu dilin
  // slug'ına çevirir (`translateRoutePath`) — tek sıçrama.
  if (localizedCountrySlug(cc, locale) !== ulke) permanentRedirect({ href: `${countryProductPath(cc)}${query}`, locale });
  return cc;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<ProductSearchParams>;
}): Promise<Metadata> {
  const { ulke } = await params;
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  const cc = countryCodeFromSlug(ulke);
  if (!cc) return { title: t("countryNotFound"), robots: { index: false } };
  const name = countryDisplayName(cc, locale);
  const count = await countryProductCount(cc);
  const page = canonicalProductListPage(await searchParams);
  const tui = await getTranslations({ locale, namespace: "web.shared.ui" });
  return buildMetadata({
    title: t("countryTitle", { name }),
    description: count > 0 ? t("countryMetaDescHas", { name, count }) : t("countryMetaDescNone", { name }),
    path: countryProductPath(cc),
    // Sayfanın kendi kartı (şehir/ülke adı + ürün sayısı), sayfanın dilinde.
    images: [ogCardPath(countryProductPath(cc), locale)],
    // Sayfalanmış sayfa KENDİ kanoniği (`?sayfa=N`); başka süzgeç → taban.
    page,
    // 2+ sayfa kendi başlık/açıklamasını taşır (arayüz testi D-084).
    pageLabel: tui("pageN", { n: page }),
    // Eşiğin altındaki ülke: sayfa DURUR ama indekse girmez (ince içerik;
    // sitemap aynı `landingIndexable`ı okur).
    noindex: !landingIndexable(count),
    locale,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<ProductSearchParams>;
}) {
  setRequestLocale(await localeFromParams(params));
  if (!MARKETPLACE_LIVE) notFound();
  const { ulke } = await params;
  const locale = await localeFromParams(params);
  const sp = await searchParams;
  const cc = await countryOr404(ulke, locale, queryStringOf(sp));
  const tp = await getTranslations("web.marketplace.pages");
  const name = countryDisplayName(cc, locale);
  const [all, inCountry, count] = await Promise.all([
    fetchProductFacets({}),
    fetchProductFacets({ country: cc }),
    countryProductCount(cc),
  ]);

  return (
    <PublicLayout className={MARKET_GROUND}>
      <ProductIndex
        title={tp("countryTitle", { name })}
        lead={count > 0 ? tp("countryLeadHas", { name }) : tp("countryLeadNone", { name })}
        searchParams={sp}
        fixedCountry={cc}
        trail={[{ name, path: countryProductPath(cc) }]}
        footer={
          <>
            {/* Bu ülkenin şehirleri + öteki ülkeler (iç bağlantı ağı). */}
            <CityLinks cities={inCountry.cities.filter((c) => !c.country || c.country === cc)} kind="products" />
            <CountryLinks countries={all.countries} activeCountry={cc} />
          </>
        }
      />
    </PublicLayout>
  );
}
