import { webTranslator } from "@/i18n/server";
import { localeFromParams } from "@/i18n/params";
import { cityFromSlug } from "@/lib/public/city";
import { fetchGeoCity, fetchProducts } from "@/lib/public/marketplace-api";
import { brandOgContent, cityOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/* `alt` Next'in dosya sözleşmesinde STATİK bir dışa aktarımdır (await edilemez,
   segmentin dilini göremez) — metin yine de katalogda dursun diye sunucu
   çevirmeninden VARSAYILAN dille okunur. Dile göre değişmesi `generateImage-
   Metadata` isterdi; o, görsel adresine `/0` ekleyeceği için bilinçle yapılmadı. */
export const alt = webTranslator()("web.seo.og.cityAlt");
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
