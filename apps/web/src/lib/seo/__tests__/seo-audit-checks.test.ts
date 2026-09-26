import { describe, expect, it } from "vitest";
import { checkPage, localeOfUrl, parseHead, sitemapLocs, turkishLeftovers } from "../../../../scripts/seo-audit-checks.mjs";

const GOOD = `<html lang="tr"><head>
<meta property="og:locale" content="tr_TR">
<link rel="alternate" hrefLang="tr" href="https://www.rothern.com/firma/acme/urun/celik-boru">
<link rel="alternate" hrefLang="en" href="https://www.rothern.com/en/companies/acme/products/celik-boru">
<link rel="alternate" hrefLang="x-default" href="https://www.rothern.com/firma/acme/urun/celik-boru">
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
      .replace('rel="canonical" href="https://www.rothern.com/firma/acme/urun/celik-boru"', 'rel="canonical" href="https://www.rothern.com/firma/acme"')
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

const EN_URL = "https://www.rothern.com/en/companies/acme/products/celik-boru";
const EN = `<html lang="en"><head>
<meta property="og:locale" content="en_US">
<link rel="alternate" hrefLang="tr" href="https://www.rothern.com/firma/acme/urun/celik-boru">
<link rel="alternate" hrefLang="en" href="${EN_URL}">
<link rel="alternate" hrefLang="x-default" href="https://www.rothern.com/firma/acme/urun/celik-boru">
<title>Steel Pipe — Acme Metal San. Tic. A.Ş. · Rothern</title>
<meta name="description" content="Seamless steel pipe from Acme Metal in İzmir, minimum order 100 metres. Request a quote on Rothern today.">
<link rel="canonical" href="${EN_URL}">
<meta property="og:image" content="${EN_URL}/opengraph-image">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","inLanguage":"en-US","name":"Steel Pipe","offers":{"@type":"Offer"}}]}</script>
</head><body><h1>Steel Pipe</h1></body></html>`;

describe("seo-audit-checks — diller (i18n SEO 2026-09-26)", () => {
  it("adresin dili ön ekten; Türkçe ön eksiz", () => {
    expect(localeOfUrl(EN_URL)).toBe("en");
    expect(localeOfUrl("https://www.rothern.com/ru/tovary")).toBe("ru");
    expect(localeOfUrl("https://www.rothern.com/urunler")).toBe("tr");
    expect(localeOfUrl("https://www.rothern.com/english-page")).toBe("tr");
  });

  it("iyi EN sayfa sorunsuz; özel adlar (İzmir, A.Ş.) çevrilmemiş sayılmaz", () => {
    expect(checkPage(EN_URL, EN, { indexable: true, type: "product" }).problems).toEqual([]);
    expect(turkishLeftovers("Güç şartlandırma ekipmanları · Samsun · A.Ş. · İzmir")).toEqual(["şartlandırma", "ekipmanları"]);
  });

  it("yanlış lang/og:locale/inLanguage, eksik kendi hreflang'i ve Türkçe kalıntı yakalanır", () => {
    const bad = EN.replace('lang="en"', 'lang="tr"')
      .replace("en_US", "tr_TR")
      .replace(`<link rel="alternate" hrefLang="en" href="${EN_URL}">`, "")
      .replace('"en-US"', '"tr-TR"')
      .replace("minimum order", "Güç şartlandırma ekipmanları");
    const r = checkPage(EN_URL, bad, { indexable: true, type: "product" });
    expect(r.problems).toEqual(
      expect.arrayContaining([
        "html lang tr (en bekleniyor)",
        "og:locale tr_TR",
        "hreflang'de kendi dili (en) yok",
        "Product.inLanguage tr-TR",
        expect.stringContaining("description: çevrilmemiş Türkçe (şartlandırma"),
      ]),
    );
  });

  it("sözleşme sayfasının Türkçe h1'i (lang=tr) muaf", () => {
    const legal = EN.replace("<h1>Steel Pipe</h1>", '<h1 lang="tr">Kullanıcı Sözleşmesi</h1>');
    expect(checkPage(EN_URL, legal).problems.filter((p) => p.startsWith("h1"))).toEqual([]);
    const notLegal = EN.replace("<h1>Steel Pipe</h1>", "<h1>Kullanıcı sözleşmesi</h1>");
    expect(checkPage(EN_URL, notLegal).problems).toContain("h1: çevrilmemiş Türkçe (sözleşmesi)");
  });
});
