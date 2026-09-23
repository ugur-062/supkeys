import { BRAND_OG } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

/** Kök OG görseli — kendi görselini tanımlamayan her sayfa bunu alır (Parça 6). */
export const alt = "Rothern — B2B tedarik pazar yeri";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard(BRAND_OG);
}
