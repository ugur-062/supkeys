/**
 * ÖNBELLEK ETİKETLERİ — API `modules/seo-index/seo-index.service.ts`
 * `SEO_TAGS` ile BİREBİR aynı dizeler (SEO Parça 5).
 *
 * API yayın anında `POST /api/seo/revalidate` ile bu etiketleri vurur;
 * `fetch` çağrısı hangi etiketi taşıyorsa o sayfa ISR süresini beklemeden
 * yenilenir. İki taraf ayrışırsa tazeleme SESSİZCE boşa gider (hata yok,
 * yalnız bayat sayfa) — `seo-tags.test.ts` API kaynağını okuyup karşılaştırır.
 */
export const SEO_TAGS = {
  products: "seo:products",
  companies: "seo:companies",
  listings: "seo:listings",
  facets: "seo:facets",
  sitemap: "seo:sitemap",
  product: (companySlug: string, slug: string) => `product:${companySlug}/${slug}`,
  company: (slug: string) => `company:${slug}`,
  listing: (number: string) => `listing:${number.toLowerCase()}`,
} as const;
