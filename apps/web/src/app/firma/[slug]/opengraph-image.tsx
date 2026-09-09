import { fetchCompanyProfile } from "@/lib/public/marketplace-api";
import { BRAND_OG, companyOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Firma profili OG kartı — sayfa ile AYNI veri çağrısı (etiketli, ISR). */
export const alt = "Firma profili — Rothern";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await fetchCompanyProfile(slug);
  return renderOgCard(p ? companyOgContent(p) : BRAND_OG);
}
