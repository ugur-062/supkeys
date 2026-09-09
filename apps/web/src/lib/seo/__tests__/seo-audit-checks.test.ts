import { describe, expect, it } from "vitest";
// @ts-expect-error — düz ESM script (bağımlılıksız), tip bildirimi yok.
import { checkPage, parseHead, sitemapLocs } from "../../../../scripts/seo-audit-checks.mjs";

const GOOD = `<html><head>
<title>Çelik Boru — Acme Metal · Rothern</title>
<meta name="description" content="Çelik boru, Acme Metal vitrininde. Fiyat için teklif isteyin · min. 100 metre · İzmir. Kapalı zarf teklif — Rothern.">
<link rel="canonical" href="https://www.rothern.com/firma/acme/urun/celik-boru">
<meta property="og:image" content="https://www.rothern.com/firma/acme/urun/celik-boru/opengraph-image">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Çelik Boru","offers":{"@type":"Offer"}},{"@type":"BreadcrumbList","itemListElement":[]}]}</script>
</head><body><h1>Çelik Boru</h1></body></html>`;

describe("seo-audit-checks", () => {
  it("iyi sayfa sorunsuz", () => {
    const r = checkPage("https://www.rothern.com/firma/acme/urun/celik-boru/", GOOD, { indexable: true, type: "product" });
    expect(r.problems).toEqual([]);
    expect(parseHead(GOOD).h1).toBe("Çelik Boru");
  });

  it("çift marka, kanonik uyumsuzluğu, eksik JSON-LD alanı ve Demand sahibi yakalanır", () => {
    const bad = GOOD.replace("· Rothern", "— Rothern · Rothern")
      .replace('href="https://www.rothern.com/firma/acme/urun/celik-boru"', 'href="https://www.rothern.com/firma/acme"')
      .replace('"offers":{"@type":"Offer"}', '"seller":"X"')
      .replace('"@type":"Product"', '"@type":"Demand"');
    const r = checkPage("https://www.rothern.com/firma/acme/urun/celik-boru", bad, { indexable: true, type: "listing" });
    expect(r.problems).toEqual(
      expect.arrayContaining(["title'da marka iki kez", expect.stringContaining("canonical ≠ url"), "Demand.url eksik", "Demand düğümünde sahip kimliği"]),
    );
  });

  it("noindex beklentisi iki yönlü; sitemap loc ayrıştırma", () => {
    const withNoindex = GOOD.replace("<title>", '<meta name="robots" content="noindex, follow"><title>');
    expect(checkPage("https://www.rothern.com/firma/acme/urun/celik-boru", withNoindex).problems).toContain("beklenmedik noindex");
    expect(checkPage("https://www.rothern.com/firma/acme/urun/celik-boru", GOOD, { indexable: false }).problems).toContain("noindex bekleniyordu");
    expect(sitemapLocs("<sitemapindex><sitemap><loc>https://x/a.xml</loc></sitemap></sitemapindex>")).toEqual(["https://x/a.xml"]);
    expect(sitemapLocs('<urlset><url><loc>https://x/p</loc><image:image><image:loc>https://cdn/i.jpg</image:loc></image:image></url></urlset>')).toEqual(["https://x/p"]);
  });
});
