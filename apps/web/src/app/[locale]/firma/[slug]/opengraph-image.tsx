import { localeFromParams } from "@/i18n/params";
import { fetchCompanyProfile } from "@/lib/public/marketplace-api";
import { brandOgContent, companyOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Firma profili OG kartı — sayfa ile AYNI veri çağrısı (etiketli, ISR). */
export const alt = "Firma profili — Rothern";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  slug: string }> }) {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const p = await fetchCompanyProfile(slug);
  return renderOgCard(p ? companyOgContent(p, locale) : brandOgContent(locale));
}
