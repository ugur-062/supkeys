import { fetchProduct } from "@/lib/public/marketplace-api";
import { BRAND_OG, productOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Ürün OG kartı: fotoğraf + ad + fiyat/MOQ + satıcı (satıcı üründe AÇIK). */
export const alt = "Ürün — Rothern";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string; urunSlug: string }> }) {
  const { slug, urunSlug } = await params;
  const data = await fetchProduct(slug, urunSlug);
  return renderOgCard(data ? productOgContent(data.product, data.company) : BRAND_OG);
}
