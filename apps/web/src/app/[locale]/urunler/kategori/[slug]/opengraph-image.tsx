import { localeFromParams } from "@/i18n/params";
import { parseCategoryCode } from "@/lib/public/marketplace";
import { fetchProductFacets } from "@/lib/public/marketplace-api";
import { brandOgContent, categoryOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

export const alt = "Kategori — Rothern";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  slug: string }> }) {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const code = parseCategoryCode(slug);
  const cat = code ? (await fetchProductFacets()).categories.find((c) => c.id === code) : null;
  return renderOgCard(cat ? categoryOgContent(cat.name, cat.count, locale) : brandOgContent(locale));
}
