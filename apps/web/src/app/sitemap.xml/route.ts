import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { fetchSitemapSummary } from "@/lib/public/marketplace-api";
import { indexItems } from "@/lib/seo/sitemap-parts";
import { sitemapIndexXml } from "@/lib/seo/sitemap-xml";

/**
 * /sitemap.xml — SİTEMAP İNDEKSİ (SEO Parça 5). Parçalar `/sitemaps/<ad>.xml`.
 *
 * Saatlik yeniden üretim; yayın anında API `revalidatePath("/sitemap.xml")`
 * ile anında tazeler. Yayın öncesi BOŞ indeks: var olmayan (404) adresleri
 * listelemek tarayıcıya yanlış bilgi vermek olurdu.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const items = MARKETPLACE_LIVE ? indexItems(await fetchSitemapSummary()) : [];
  return new Response(sitemapIndexXml(items), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
