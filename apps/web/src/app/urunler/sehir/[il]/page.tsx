import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { CityLinks } from "@/components/marketplace/city-links";
import { ProductIndex, type ProductSearchParams } from "@/components/marketplace/product-index";
import { allCitySlugs, cityFromSlug, cityProductPath, citySlug } from "@/lib/public/city";
import { fetchProductFacets } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/**
 * ŞEHİR AÇILIŞ SAYFASI — ÜRÜNLER (2026-09-09, Parça 3: coğrafi SEO/GEO).
 *
 * "İstanbul çelik boru tedarikçisi" tipi aramalar B2B hacminin büyük
 * bölümüdür ve bunlar sorgu parametresiyle karşılanamaz: `?sehir=` bir süzgeç
 * varyantıdır, kanoniği `/urunler`e işaret eder ve indekslenmez. Her ilin
 * KENDİ adresi, kendi başlığı, kendi açıklaması ve kendi kanoniği olur.
 *
 * BOŞ ŞEHRİN SAYFASI 404 DEĞİL, `noindex`: 81 il sabit ve kamuya açık bir
 * olgu; "Yozgat" adresine gelen kullanıcıyı 404'e atmak yerine dürüst boş
 * liste + öteki şehirlere bağlantı gösteriyoruz. İndekse girmemesi yeter —
 * ince içerik sinyali oradan gelir. (Kategori sayfası tersine 404 verir:
 * orada 158 bin kod var ve boş olanı üretmek boş sayfa YIĞINI demekti.)
 *
 * Sitemap'e YALNIZ ürünü olan iller girer (bkz. app/sitemap.ts).
 */
export const revalidate = 600;
export const dynamicParams = true;

type Params = Promise<{ il: string }>;

export async function generateStaticParams() {
  if (!MARKETPLACE_LIVE) return [];
  const facets = await fetchProductFacets({});
  const known = new Map(allCitySlugs().map((c) => [c.name, c.slug]));
  return facets.cities
    .filter((c) => c.count > 0 && known.has(c.city))
    .map((c) => ({ il: known.get(c.city)! }));
}

async function cityOr404(il: string) {
  const name = cityFromSlug(il);
  if (!name) notFound();
  // Kanonik olmayan yazım (büyük harf, eski slug) → 308.
  if (citySlug(name) !== il) permanentRedirect(cityProductPath(name));
  return name;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { il } = await params;
  const name = cityFromSlug(il);
  if (!name) return { title: "Şehir bulunamadı", robots: { index: false } };
  const facets = await fetchProductFacets({ city: name });
  const count = facets.cities.find((c) => c.city === name)?.count ?? 0;

  return buildMetadata({
    title: `${name} tedarikçileri ve ürünleri`,
    description:
      count > 0
        ? `${name}'daki firmaların vitrinlerindeki ${count} ürün: teknik özellik, minimum sipariş ve fiyat bilgisiyle. Tedarikçiyi seçin, doğrudan bilgi isteyin.`
        : `${name} için Rothern'de henüz yayımlanmış ürün yok. Yakın illerdeki tedarikçileri inceleyin ya da alım talebinizi ücretsiz yayımlayın.`,
    path: cityProductPath(name),
    // Ürünü olmayan il: sayfa DURUR ama indekse girmez (ince içerik).
    noindex: count === 0,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<ProductSearchParams>;
}) {
  if (!MARKETPLACE_LIVE) notFound();
  const { il } = await params;
  const name = await cityOr404(il);
  const [sp, facets] = await Promise.all([searchParams, fetchProductFacets({})]);
  const count = facets.cities.find((c) => c.city === name)?.count ?? 0;

  return (
    <PublicLayout className={MARKET_GROUND}>
      <ProductIndex
        title={`${name} tedarikçileri ve ürünleri`}
        lead={
          count > 0
            ? `${name}'daki firmaların Rothern vitrinine koyduğu ürünler. Kategori, faaliyet tipi ve fiyat bilgisine göre süzün.`
            : `${name} için henüz yayımlanmış ürün yok. Aşağıdaki illerden devam edebilir ya da alım talebi açabilirsiniz.`
        }
        searchParams={sp}
        fixedCity={name}
        footer={<CityLinks cities={facets.cities} kind="products" activeCity={name} />}
      />
    </PublicLayout>
  );
}
