import { ViewBeacon } from "@/components/marketplace/view-beacon";
import { ProductDetail } from "@/components/marketplace/product-detail";
import { fetchProduct, fetchRelatedProducts } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { productSeo } from "@/lib/seo/entities";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Ürün sayfası — firmanın ALTINDA yaşar (`/firma/<slug>/urun/<slug>`).
 *
 * URL'in firma altında olması bilinçli: ürün sayfası firma sayfasının
 * otoritesinden beslenir ve ikisi arasındaki ilişki adresten okunur.
 * Europages de aynı şemayı kullanıyor.
 */
export const revalidate = 300;

type Params = Promise<{ slug: string; urunSlug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug, urunSlug } = await params;
  const data = await fetchProduct(slug, urunSlug);
  if (!data) return { title: "Ürün bulunamadı", robots: { index: false } };

  /* Başlık, açıklama, kanonik ve OG TEK KAYNAKTAN (`lib/seo/entities.ts`) —
     sayfanın JSON-LD'siyle aynı olgulardan türer. `indexable`: pazar yeri
     anahtarı kapalıyken sayfa GÖRÜNÜR ama indekslenmez (sitemap de aynı
     anahtara bağlı; iki kapı tutarlı). */
  return productSeo({
    companySlug: slug,
    product: data.product,
    company: data.company,
    indexable: MARKETPLACE_LIVE,
  }).metadata;
}

/**
 * GÖRÜNÜRLÜK ≠ İNDEKSLENME (2026-09-03).
 *
 * Sayfa pazar yeri anahtarından BAĞIMSIZ açıktır: ürün, firmanın zaten
 * herkese açık olan profilinin altında yaşıyor ve panelde "vitrinde
 * yayımlandı" denen kayıt bir bağlantı vermeli. Anahtar kapalıyken sayfa
 * `noindex` alır (aşağıda) ve sitemap'e girmez — indekslenme kapalı kalır.
 */
export default async function Page({ params }: { params: Params }) {
  const { slug, urunSlug } = await params;
  const [data, related] = await Promise.all([fetchProduct(slug, urunSlug), fetchRelatedProducts(slug, urunSlug)]);
  if (!data) notFound();
  return (
    <>
    <ViewBeacon type="product" companySlug={slug} productSlug={urunSlug} />
    <ProductDetail
      related={related}
      product={data.product}
      company={data.company}
      companySlug={slug}
    />
    </>
  );
}
