import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { buildPart, parsePartName } from "@/lib/seo/sitemap-parts";
import { urlsetXml } from "@/lib/seo/sitemap-xml";

/**
 * /sitemaps/<parça>.xml — sitemap parçası (SEO Parça 5).
 * Ad şeması ve içerik `lib/seo/sitemap-parts.ts`te; bilinmeyen ad 404.
 */
export const revalidate = 3600;

/** Temel parçalar önceden üretilir (ISR); `products-1` gibi ek sayfalar ilk istekte. */
export function generateStaticParams() {
  return ["pages", "categories", "cities", "products", "companies", "listings"].map((k) => ({ name: `${k}.xml` }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await ctx.params;
  const part = parsePartName(name.replace(/\.xml$/, ""));
  if (!part || !name.endsWith(".xml")) return new Response("Not found", { status: 404 });
  const urls = MARKETPLACE_LIVE ? await buildPart(part) : [];
  return new Response(urlsetXml(urls), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
