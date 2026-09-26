import { describe, expect, it } from "vitest";
import { sitemapIndexXml, urlsetXml, xmlEscape } from "../sitemap-xml";
import { indexItems, located, parsePartName, partPath } from "../sitemap-parts";

describe("sitemap XML", () => {
  it("URL, lastmod (saniye hassasiyeti), görsel uzantısı ve kaçış", () => {
    const xml = urlsetXml([
      {
        loc: "https://www.rothern.com/firma/acme/urun/boru-3-4",
        lastmod: "2026-09-09T10:11:12.345Z",
        changefreq: "weekly",
        priority: 0.7,
        images: [{ loc: "https://cdn.rothern.com/a.webp", title: 'Boru 3/4" & Dirsek' }],
      },
      { loc: "https://www.rothern.com/urunler" },
    ]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain("<lastmod>2026-09-09T10:11:12Z</lastmod>");
    expect(xml).toContain("<priority>0.7</priority>");
    expect(xml).toContain("<image:title>Boru 3/4&quot; &amp; Dirsek</image:title>");
    // lastmod yoksa alan HİÇ yazılmaz (uydurma tarih yok)
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });

  it("görselsiz sette image namespace'i eklenmez; geçersiz lastmod atlanır", () => {
    const xml = urlsetXml([{ loc: "https://x/y", lastmod: "abc" }]);
    expect(xml).not.toContain("xmlns:image");
    expect(xml).not.toContain("<lastmod>");
  });

  it("50.000 üstü parça hata verir (sessiz kırpma yok)", () => {
    const many = Array.from({ length: 50_001 }, (_, i) => ({ loc: `https://x/${i}` }));
    expect(() => urlsetXml(many)).toThrow(/sınır/);
  });

  it("indeks parçaları listeler", () => {
    const xml = sitemapIndexXml([{ loc: "https://x/sitemaps/products.xml", lastmod: "2026-09-01T00:00:00Z" }]);
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://x/sitemaps/products.xml</loc>");
  });

  it("xmlEscape beş karakteri de kaçırır", () => {
    expect(xmlEscape(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });
});

describe("sitemap parçaları", () => {
  it("ad şeması: tür[-sayfa].xml — geçersiz ad null", () => {
    expect(parsePartName("products")).toEqual({ kind: "products", page: 0 });
    expect(parsePartName("products-3")).toEqual({ kind: "products", page: 3 });
    expect(parsePartName("pages")).toEqual({ kind: "pages", page: 0 });
    expect(parsePartName("bilinmeyen")).toBeNull();
    expect(parsePartName("products-999")).toBeNull();
    expect(parsePartName("products--1")).toBeNull();
    expect(partPath("products", 0)).toBe("/sitemaps/products.xml");
    expect(partPath("products", 2)).toBe("/sitemaps/products-2.xml");
  });

  it("indeks: sayıdan parça adedi türer, lastmod gerçek özetten gelir", () => {
    const items = indexItems({
      products: { count: 45_000, lastmod: "2026-09-09T00:00:00.000Z" },
      companies: { count: 0, lastmod: null },
      listings: { count: 1, lastmod: "2026-09-08T00:00:00.000Z" },
      categories: [{ id: "39000000", name: "Elektrik", count: 2, lastmod: "2026-09-07T00:00:00.000Z" }],
      productCities: [],
      companyCities: [],
    });
    const locs = items.map((i) => i.loc);
    // 45.000 / 5.000 → 9 ürün parçası; boş firma seti yine 1 parça (boş dosya, 404 değil)
    expect(locs.filter((l) => l.includes("/sitemaps/products"))).toHaveLength(9);
    expect(locs.filter((l) => l.includes("/sitemaps/companies"))).toHaveLength(1);
    expect(locs).toContain("http://localhost:3000/sitemaps/products-2.xml");
    expect(items.find((i) => i.loc.endsWith("/sitemaps/categories.xml"))?.lastmod).toBe("2026-09-07T00:00:00.000Z");
    expect(items.find((i) => i.loc.endsWith("/sitemaps/pages.xml"))?.lastmod).toBeNull();
  });
});

describe("sitemap dilleri (i18n SEO 2026-09-26)", () => {
  const S = "http://localhost:3000";

  it("her dil KENDİ <url> girdisi; her girdide aynı tam hreflang seti + x-default Türkçe", () => {
    const urls = located("/firma/acme/urun/boru", { changefreq: "weekly" });
    expect(urls.map((u) => u.loc)).toEqual([
      `${S}/firma/acme/urun/boru`,
      `${S}/en/companies/acme/products/boru`,
      `${S}/ru/kompanii/acme/tovary/boru`,
    ]);
    for (const u of urls) {
      expect(u.alternates).toEqual({
        tr: `${S}/firma/acme/urun/boru`,
        en: `${S}/en/companies/acme/products/boru`,
        ru: `${S}/ru/kompanii/acme/tovary/boru`,
        "x-default": `${S}/firma/acme/urun/boru`,
      });
      expect(u.changefreq).toBe("weekly");
    }
  });

  it("çevirisi gelmemiş dil ne girdi ne alternatif olur", () => {
    const urls = located("/firma/acme/urun/boru", {}, ["tr"]);
    expect(urls).toHaveLength(1);
    expect(urls[0]!.alternates).toEqual({ tr: `${S}/firma/acme/urun/boru`, "x-default": `${S}/firma/acme/urun/boru` });
  });

  it("Türkçe yoksa x-default yazılmaz; hiç dil yoksa girdi yok", () => {
    const urls = located("/firma/acme", {}, ["en", "ru"]);
    expect(urls.map((u) => u.loc)).toEqual([`${S}/en/companies/acme`, `${S}/ru/kompanii/acme`]);
    expect(urls[0]!.alternates).not.toHaveProperty("x-default");
    expect(located("/firma/acme", {}, [])).toEqual([]);
  });

  it("XML: her girdide kendini de içeren hreflang bağlantıları", () => {
    const xml = urlsetXml(located("/urunler", { priority: 0.9 }));
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml.match(/<xhtml:link /g)).toHaveLength(12);
    expect(xml).toContain(`<loc>${S}/ru/tovary</loc>`);
  });
});
