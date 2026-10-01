import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@rothern/i18n";
import { countryProductPath, provinceDisplayName } from "@rothern/shared";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { CityLinks } from "@/components/marketplace/city-links";
import { ProductIndex, type ProductSearchParams } from "@/components/marketplace/product-index";
import { cityFromSlug, cityProductPath, citySlug, decodeCityParam } from "@/lib/public/city";
import { attributeSsrToVisitor } from "@/lib/public/ssr-visitor";
import { fetchGeoCity, fetchProductFacets, fetchProducts } from "@/lib/public/marketplace-api";
import { countryDisplayName } from "@/i18n/domain";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { canonicalProductListPage, landingIndexable, queryStringOf } from "@/lib/seo/landing";
import { buildMetadata, ogCardPath } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { permanentRedirect } from "@/i18n/navigation";

/**
 * ŞEHİR AÇILIŞ SAYFASI — ÜRÜNLER (2026-09-09, Parça 3: coğrafi SEO/GEO).
 *
 * "İstanbul çelik boru tedarikçisi" tipi aramalar B2B hacminin büyük
 * bölümüdür ve bunlar sorgu parametresiyle karşılanamaz: `?sehir=` bir süzgeç
 * varyantıdır, kanoniği `/urunler`e işaret eder ve indekslenmez. Her ilin
 * KENDİ adresi, kendi başlığı, kendi açıklaması ve kendi kanoniği olur.
 *
 * BOŞ ŞEHRİN SAYFASI 404 DEĞİL, `noindex` (eşiğin — `MIN_LANDING_PRODUCTS` —
 * altındaki şehir de; 33,7 bin dünya şehriyle tek ürünlük binlerce ince
 * sayfa doğuyordu, 2026-09-27): şehir listesi sabit ve kamuya açık bir
 * olgu; "Yozgat" adresine gelen kullanıcıyı 404'e atmak yerine dürüst boş
 * liste + öteki şehirlere bağlantı gösteriyoruz. İndekse girmemesi yeter —
 * ince içerik sinyali oradan gelir. (Kategori sayfası tersine 404 verir:
 * orada 158 bin kod var ve boş olanı üretmek boş sayfa YIĞINI demekti.)
 *
 * Sitemap'e YALNIZ ürünü olan şehirler girer — dünya geneli (bkz. sitemap-parts).
 */
export const revalidate = 600;
export const dynamicParams = true;

type Params = Promise<{ locale: string; il: string }>;

/* `generateStaticParams` YOK (2026-09-26): sayfa `searchParams` okuduğu için
   zaten dinamik; derleme anındaki geçici API hatası sayfayı statik 404/boş
   olarak kilitleyebiliyordu (bkz. kategori sayfası). */

/**
 * Şehir — DÜNYA ŞEHİR LİSTESİNDEN (2026-09-27, kullanıcı: "şehir sayfaları
 * türkiye özel olamaz"). Kalıcı adres ("bursa", "de-munich") API'den çözülür;
 * API bu ucu henüz vermiyorsa (eski sürüm) Türk illeri yerel listeden.
 * Yabancı şehrin adı ülkesiyle birlikte ("Münih, Almanya") — aynı adlı
 * şehirler (Valencia) karışmasın.
 */
async function resolveCity(
  il: string,
  locale: Locale,
): Promise<{ slug: string; shown: string; name: string; countryCode: string } | null> {
  // Sayfa ve metadata `searchParams` okuduğu için dinamik: rastgele şehir
  // adresi ortak SSR kovasına değil ziyaretçi kovasına sayılsın (RM-12).
  await attributeSsrToVisitor();
  const geo = await fetchGeoCity(il);
  if (geo) {
    return {
      slug: geo.slug,
      shown: geo.countryCode === "TR" ? geo.name : `${geo.name}, ${countryDisplayName(geo.countryCode, locale)}`,
      name: geo.name,
      countryCode: geo.countryCode,
    };
  }
  const tr = cityFromSlug(il);
  if (!tr) return null;
  const name = provinceDisplayName(tr, locale);
  return { slug: citySlug(tr), shown: name, name, countryCode: "TR" };
}

/**
 * Şehirdeki ürün SAYISI — liste ucunun `total`ı (2026-09-27 SEO denetimi).
 * Facet sayacı KULLANILMAZ: facet ucu sırasız ilk 5.000 ürünü tarayıp şehri
 * bellekte süzüyor; katalog büyüyünce ürünü olan şehir "0" görünüp `noindex`
 * alıyordu (sitemap onu listelerken). Liste ucu şehri sorguda süzer ve
 * `ProductIndex`in ilk sayfa isteğiyle AYNI adres → veri önbelleği paylaşır.
 */
async function cityProductCount(slug: string): Promise<number> {
  return (await fetchProducts({ city: slug })).total;
}

async function cityOr404(il: string, locale: Locale, query: string) {
  const city = await resolveCity(il, locale);
  if (!city) notFound();
  // Kanonik olmayan yazım (büyük harf, eski ham il adı) → 308; sorgu KORUNUR.
  if (city.slug !== il) permanentRedirect({ href: `${cityProductPath(city.slug)}${query}`, locale });
  return city;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<ProductSearchParams>;
}): Promise<Metadata> {
  // Yüzde kodlu parça bir kez çözülür (arayüz testi D-323, bkz. `decodeCityParam`).
  const il = decodeCityParam((await params).il);
  const locale = await localeFromParams(params);
  const city = await resolveCity(il, locale);
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  if (!city) return { title: t("cityNotFound"), robots: { index: false } };
  const count = await cityProductCount(city.slug);

  // Sayfalanmış sayfa (yalnız `?sayfa=N`) KENDİ kanoniği; başka süzgeç → taban
  // (2026-09-27, Google önerisi — eski "her sayfa iniş adresine" kuralı kalktı).
  return buildMetadata({
    title: t("cityTitle", { name: city.shown }),
    description:
      count > 0
        ? t("cityMetaDescHas", { name: city.shown, count })
        : t("cityMetaDescNone", { name: city.shown }),
    path: cityProductPath(city.slug),
    // Sayfanın kendi kartı (şehir/ülke adı + ürün sayısı), sayfanın dilinde.
    images: [ogCardPath(cityProductPath(city.slug), locale)],
    page: canonicalProductListPage(await searchParams),
    // Eşiğin altındaki şehir: sayfa DURUR ama indekse girmez (ince içerik;
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
  // Yüzde kodlu parça bir kez çözülür (arayüz testi D-323, bkz. `decodeCityParam`).
  const il = decodeCityParam((await params).il);
  const locale = await localeFromParams(params);
  const sp = await searchParams;
  const city = await cityOr404(il, locale, queryStringOf(sp));
  const tp = await getTranslations("web.marketplace.pages");
  const [facets, count] = await Promise.all([fetchProductFacets({}), cityProductCount(city.slug)]);

  return (
    <PublicLayout className={MARKET_GROUND}>
      <ProductIndex
        title={tp("cityTitle", { name: city.shown })}
        lead={count > 0 ? tp("cityLeadHas", { name: city.shown }) : tp("cityLeadNone", { name: city.shown })}
        searchParams={sp}
        fixedCity={city.slug}
        trail={[
          { name: countryDisplayName(city.countryCode, locale), path: countryProductPath(city.countryCode) },
          { name: city.name, path: cityProductPath(city.slug) },
        ]}
        footer={<CityLinks cities={facets.cities} kind="products" activeCity={city.slug} />}
      />
    </PublicLayout>
  );
}
