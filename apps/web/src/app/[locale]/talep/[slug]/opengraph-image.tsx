import { localeFromParams } from "@/i18n/params";
import { parseListingNumber } from "@/lib/public/marketplace";
import { fetchListing } from "@/lib/public/marketplace-api";
import { brandOgContent, listingOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Alım talebi OG kartı — SAHİP ANONİM (içerik üreticisi adı almaz). */
export const alt = "Alım talebi — Rothern";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string;  slug: string }> }) {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const number = parseListingNumber(slug);
  const l = number ? await fetchListing(number) : null;
  return renderOgCard(l ? listingOgContent(l, locale) : brandOgContent(locale));
}
