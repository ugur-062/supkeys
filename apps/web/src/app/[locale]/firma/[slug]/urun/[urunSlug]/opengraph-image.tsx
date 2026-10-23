import { localeFromParams } from "@/i18n/params";
import { fetchProduct } from "@/lib/public/marketplace-api";
import { brandOgContent, productOgContent } from "@/lib/seo/og/content";
import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Ürün OG kartı: fotoğraf + ad + fiyat/MOQ + satıcı (satıcı üründe AÇIK). */
/* `alt` statik dışa aktarım (segmentin dilini göremez) → dilden bağımsız
   `OG_ALT`; sayfanın og:image:alt'ı `buildMetadata`dan, sayfanın dilinde. */
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  slug: string; urunSlug: string }> }) {
  const { slug, urunSlug } = await params;
  const locale = await localeFromParams(params);
  const data = await fetchProduct(slug, urunSlug);
  return renderOgCard(data ? productOgContent(data.product, data.company, locale) : brandOgContent(locale));
}
