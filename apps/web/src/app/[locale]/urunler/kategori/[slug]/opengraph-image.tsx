import { localeFromParams } from "@/i18n/params";
import { parseCategoryCode } from "@/lib/public/marketplace";
import { brandOgContent, categoryOgContent } from "@/lib/seo/og/content";
import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";
import { resolveSegmentLanding } from "./category-data";

/* `alt` dile göre değişemez (statik dışa aktarım) → dilden bağımsız; sayfanın
   kendi og:image:alt'ı `buildMetadata`dan, sayfanın dilinde (bkz. `OG_ALT`). */
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  slug: string }> }) {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const code = parseCategoryCode(slug);
  // Sayı ve ad sayfanın kendisiyle AYNI çözümden (segment listesi + liste `total`ı).
  const cat = code ? await resolveSegmentLanding(code) : null;
  return renderOgCard(cat ? categoryOgContent(cat.name, cat.count, locale) : brandOgContent(locale));
}
