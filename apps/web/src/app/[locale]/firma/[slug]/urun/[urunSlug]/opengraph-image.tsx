import { webTranslator } from "@/i18n/server";
import { localeFromParams } from "@/i18n/params";
import { fetchProduct } from "@/lib/public/marketplace-api";
import { brandOgContent, productOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Ürün OG kartı: fotoğraf + ad + fiyat/MOQ + satıcı (satıcı üründe AÇIK). */
/* `alt` Next'in dosya sözleşmesinde STATİK bir dışa aktarımdır (await edilemez,
   segmentin dilini göremez) — metin yine de katalogda dursun diye sunucu
   çevirmeninden VARSAYILAN dille okunur. Dile göre değişmesi `generateImage-
   Metadata` isterdi; o, görsel adresine `/0` ekleyeceği için bilinçle yapılmadı. */
export const alt = webTranslator()("web.seo.og.productAlt");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  slug: string; urunSlug: string }> }) {
  const { slug, urunSlug } = await params;
  const locale = await localeFromParams(params);
  const data = await fetchProduct(slug, urunSlug);
  return renderOgCard(data ? productOgContent(data.product, data.company, locale) : brandOgContent(locale));
}
