import { webTranslator } from "@/i18n/server";
import { localeFromParams } from "@/i18n/params";
import { countryDisplayName } from "@/i18n/domain";
import { countryCodeFromSlug } from "@rothern/shared";
import { fetchProducts } from "@/lib/public/marketplace-api";
import { brandOgContent, countryOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/* Ülke açılış sayfası kartı (2026-09-27) — şehir kartıyla aynı kalıp. `alt`
   statik dışa aktarım (dil göremez), bkz. şehir `opengraph-image.tsx`. */
export const alt = webTranslator()("web.seo.og.countryAlt");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string; ulke: string }> }) {
  const { ulke } = await params;
  const locale = await localeFromParams(params);
  const cc = countryCodeFromSlug(ulke);
  if (!cc) return renderOgCard(brandOgContent(locale));
  // Sayı sayfanın kendisiyle AYNI kaynaktan: liste ucunun `total`ı (facet
  // sayacı ilk 5.000 ürünle sınırlı).
  const { total } = await fetchProducts({ country: cc });
  return renderOgCard(countryOgContent(countryDisplayName(cc, locale), total, locale));
}
