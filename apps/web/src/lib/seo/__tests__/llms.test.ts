import { describe, expect, it } from "vitest";
import { seoT } from "@/i18n/server";
import { buildLlmsFullTxt, buildLlmsTxt, llmsPath } from "../llms";

/* llms.txt ÜÇ DİLDE (2026-09-27 SEO/GEO denetimi): kök İngilizce, her dilin
   kendi adresleri; kurallar (talep sahibi / teklif sayısı yayımlanmaz) her
   dilde; katalog anahtarı ham yol olarak sızmaz. */
const S = "http://localhost:3000";
const data = {
  stats: { products: 12, openDemands: 3, categories: 2 },
  facets: {
    categories: [{ id: "40000000", name: "Distribution and conditioning systems", level: 1, count: 12, slug: "dagitim-ve-sartlandirma-sistemleri" }],
    cities: [
      { city: "istanbul", name: "Istanbul", country: "TR", count: 7 },
      { city: "de-munich", name: "Munich", country: "DE", count: 5 },
    ],
    countries: [{ country: "DE", count: 5 }],
  },
  faq: [{ q: "What is Rothern?", a: "A B2B sourcing marketplace." }],
  countryLabel: (cc: string) => ({ DE: "Germany", TR: "Türkiye" })[cc] ?? cc,
  today: "2026-09-27",
};

describe("llms.txt", () => {
  it("İngilizce sürüm: İngilizce adresler, ülke slug'ı dilin adıyla, gizlilik kuralları, öteki dillere bağlantı", () => {
    const txt = buildLlmsTxt("en", seoT("en"));
    expect(txt).toContain(`${S}/en/products`);
    expect(txt).toContain(`${S}/en/buying-requests`);
    expect(txt).toContain(`${S}/en/products/country/de-germany`);
    expect(txt).toContain("/en/companies/<company-slug>/products/<product-slug>");
    expect(txt).toContain("sealed bidding");
    expect(txt).toMatch(/NUMBER of quotes is not published/);
    expect(txt).toContain(`[Türkçe](${S}/tr/llms.txt)`);
    expect(txt).toContain(`[Русский](${S}/ru/llms.txt)`);
    expect(txt).not.toContain(`${S}/en/llms.txt)`);
    expect(txt).not.toMatch(/web\.marketing\.llms\./);
    expect(txt).not.toMatch(/\btender\b/i);
  });

  it("Türkçe ve Rusça sürüm kendi adresleriyle; anahtar sızıntısı yok", () => {
    const tr = buildLlmsTxt("tr", seoT("tr"));
    expect(tr).toContain(`${S}/urunler/ulke/de-almanya`);
    expect(tr).toContain("/firma/<firma-slug>/urun/<urun-slug>");
    const ru = buildLlmsTxt("ru", seoT("ru"));
    expect(ru).toContain(`${S}/ru/tovary/strana/de-germaniya`);
    expect(ru).toContain(`${S}/ru/zayavki`);
    for (const txt of [tr, ru]) expect(txt).not.toMatch(/web\.marketing\.llms\./);
    expect(ru).not.toMatch(/тендер/i);
  });

  it("dil sürümü adresi: her dil ön ekli (kök İngilizce)", () => {
    expect(llmsPath("llms.txt", "tr")).toBe("/tr/llms.txt");
    expect(llmsPath("llms-full.txt", "ru")).toBe("/ru/llms-full.txt");
  });
});

describe("llms-full.txt", () => {
  it("envanter gerçek sayılar, adresler ve SSS dilde; firma sayısı yok", () => {
    const txt = buildLlmsFullTxt("en", seoT("en"), data);
    expect(txt).toContain("Published products: 12");
    expect(txt).toContain(`[Distribution and conditioning systems](${S}/en/products/category/40000000-dagitim-ve-sartlandirma-sistemleri) — 12 products`);
    expect(txt).toContain(`[Munich, Germany](${S}/en/products/city/de-munich)`);
    expect(txt).toContain(`[Germany](${S}/en/products/country/de-germany) — 5 products`);
    expect(txt).toContain("### What is Rothern?");
    expect(txt).toContain(`${S}/en/llms.txt`);
    expect(txt).not.toMatch(/compan(y|ies):\s*\d/i);
    expect(txt).not.toMatch(/web\.marketing\.llms\./);
  });

  it("boş envanterde envanter bölümü basılmaz", () => {
    const txt = buildLlmsFullTxt("ru", seoT("ru"), { ...data, stats: { products: 0, openDemands: 0, categories: 0 } });
    expect(txt).not.toContain("## Каталог\n");
    expect(txt).toContain(`${S}/ru/tovary/strana/de-germaniya`);
  });
});
