import { brandOgContent } from "@/lib/seo/og/content";
import { localeFromParams } from "@/i18n/params";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Kök OG görseli — kendi görselini tanımlamayan her sayfa bunu alır (Parça 6). */
export const alt = "Rothern — B2B tedarik pazar yeri";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFromParams(params);
  return renderOgCard(brandOgContent(locale));
}
