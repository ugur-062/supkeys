import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEO_TAGS } from "../tags";

/**
 * Web önbellek etiketleri ⇔ API `SEO_TAGS` — ayrışırsa tazeleme SESSİZCE
 * boşa gider (hata yok, bayat sayfa). API kaynağını okuyup her sabit
 * dizenin ve şablonun orada aynı hâliyle geçtiğini doğrular.
 */
describe("SEO etiketleri web ⇔ API", () => {
  const apiSrc = readFileSync(
    path.resolve(__dirname, "../../../../../api/src/modules/seo-index/seo-index.service.ts"),
    "utf-8",
  );

  it("sabit etiketler API'de birebir var", () => {
    for (const v of [SEO_TAGS.products, SEO_TAGS.companies, SEO_TAGS.listings, SEO_TAGS.facets, SEO_TAGS.sitemap]) {
      expect(apiSrc, `API'de yok: ${v}`).toContain(`"${v}"`);
    }
  });

  it("şablon etiketleri aynı biçimi üretir", () => {
    expect(SEO_TAGS.product("acme", "boru")).toBe("product:acme/boru");
    expect(SEO_TAGS.company("acme")).toBe("company:acme");
    expect(SEO_TAGS.listing("ROT-000042")).toBe("listing:rot-000042");
    expect(apiSrc).toContain("`product:${companySlug}/${slug}`");
    expect(apiSrc).toContain("`company:${slug}`");
    expect(apiSrc).toContain("`listing:${number.toLowerCase()}`");
  });
});
