import { localeFromParams } from "@/i18n/params";
import { cityFromSlug } from "@/lib/public/city";
import { fetchGeoCity, fetchProducts } from "@/lib/public/marketplace-api";
import { brandOgContent, cityOgContent } from "@/lib/seo/og/content";
import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/* `alt` statik dışa aktarım (segmentin dilini göremez) → dilden bağımsız
   `OG_ALT`; sayfanın og:image:alt'ı `buildMetadata`dan, sayfanın dilinde. */
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  il: string }> }) {
  const { il } = await params;
  const locale = await localeFromParams(params);
  // Dünya şehir listesi (2026-09-27); API eskiyse Türk illeri yerel listeden.
  const geo = await fetchGeoCity(il);
  const slug = geo?.slug ?? (cityFromSlug(il) ? il : null);
  const name = geo?.name ?? cityFromSlug(il);
  if (!slug || !name) return renderOgCard(brandOgContent(locale));
  // Sayı sayfayla AYNI kaynaktan: liste ucunun `total`ı (facet sayacı ilk
  // 5.000 ürünle sınırlı, 2026-09-27 SEO denetimi).
  const { total } = await fetchProducts({ city: slug });
  return renderOgCard(cityOgContent("products", name, total, locale));
}
