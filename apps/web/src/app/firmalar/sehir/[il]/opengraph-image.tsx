import { cityFromSlug } from "@/lib/public/city";
import { fetchPublicDirectoryFacets } from "@/lib/public/marketplace-api";
import { BRAND_OG, cityOgContent } from "@/lib/seo/og/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/og/card";

export const alt = "Şehir firmaları — Rothern";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ il: string }> }) {
  const { il } = await params;
  const name = cityFromSlug(il);
  if (!name) return renderOgCard(BRAND_OG);
  const facets = await fetchPublicDirectoryFacets({ city: name });
  const count = facets.cities.find((c) => c.city === name)?.count ?? 0;
  return renderOgCard(cityOgContent("companies", name, count));
}
