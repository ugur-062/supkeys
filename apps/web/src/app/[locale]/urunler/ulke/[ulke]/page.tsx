import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams } from "@/i18n/params";
import type { Locale } from "@rothern/i18n";
import { countryCodeFromSlug, countryProductPath, countrySlug } from "@rothern/shared";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { CityLinks } from "@/components/marketplace/city-links";
import { CountryLinks } from "@/components/marketplace/country-links";
import { ProductIndex, type ProductSearchParams } from "@/components/marketplace/product-index";
import { fetchProductFacets } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { countryDisplayName } from "@/i18n/domain";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { permanentRedirect } from "@/i18n/navigation";

/**
 * ÜLKE AÇILIŞ SAYFASI — ÜRÜNLER (2026-09-27, kullanıcı: "bu uluslararası bir
 * sistem"). "Turkish suppliers", "поставщики из Турции", "German machinery
 * suppliers" tipi aramaların karşılığı: satıcı ülkesine göre ürünler, kendi
 * adresi/başlığı/kanoniği ile. Şehir sayfasıyla aynı kalıp: boş ülke 404 DEĞİL
 * `noindex`; sitemap'e yalnız ürünü olan ülkeler girer.
 *
 * Adres `<kod>-<türkçe-ad>` ("de-almanya") — kod ÖNDE (slug kuralı), dilden
 * bağımsız; ad kısmı değişse de kod çözülür ve kanoniğe 308.
 */
export const revalidate = 600;

type Params = Promise<{ locale: string; ulke: string }>;

async function countryOr404(ulke: string, locale: Locale) {
  const cc = countryCodeFromSlug(ulke);
  if (!cc) notFound();
  if (countrySlug(cc) !== ulke) permanentRedirect({ href: countryProductPath(cc), locale });
  return cc;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { ulke } = await params;
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  const cc = countryCodeFromSlug(ulke);
  if (!cc) return { title: t("countryNotFound"), robots: { index: false } };
  const name = countryDisplayName(cc, locale);
  const facets = await fetchProductFacets({ country: cc });
  const count = facets.countries?.find((c) => c.country === cc)?.count ?? 0;
  return buildMetadata({
    title: t("countryTitle", { name }),
    description: count > 0 ? t("countryMetaDescHas", { name, count }) : t("countryMetaDescNone", { name }),
    path: countryProductPath(cc),
    // Ürünü olmayan ülke: sayfa DURUR ama indekse girmez (ince içerik).
    noindex: count === 0,
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
  const cc = await countryOr404(ulke, locale);
  const tp = await getTranslations("web.marketplace.pages");
  const name = countryDisplayName(cc, locale);
  const [sp, all, inCountry] = await Promise.all([
    searchParams,
    fetchProductFacets({}),
    fetchProductFacets({ country: cc }),
  ]);
  const count = all.countries?.find((c) => c.country === cc)?.count ?? 0;

  return (
    <PublicLayout className={MARKET_GROUND}>
      <ProductIndex
        title={tp("countryTitle", { name })}
        lead={count > 0 ? tp("countryLeadHas", { name }) : tp("countryLeadNone", { name })}
        searchParams={sp}
        fixedCountry={cc}
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
