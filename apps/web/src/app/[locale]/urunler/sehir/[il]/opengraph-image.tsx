import { webTranslator } from "@/i18n/server";
import { localeFromParams } from "@/i18n/params";
import { cityFromSlug } from "@/lib/public/city";
import { fetchProductFacets } from "@/lib/public/marketplace-api";
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
  const name = cityFromSlug(il);
  if (!name) return renderOgCard(brandOgContent(locale));
  const facets = await fetchProductFacets({ city: name });
  const count = facets.cities.find((c) => c.city === name)?.count ?? 0;
  return renderOgCard(cityOgContent("products", name, count, locale));
}
