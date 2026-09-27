import { describe, expect, it } from "vitest";
import { breadcrumbNode, itemListNode, organizationNode } from "../jsonld";
import { buildMetadata, ogCardPath } from "../meta";

/* 2026-09-27 SEO denetimi: liste JSON-LD'si ve varsayılan OG kartı sayfanın
   DİLİNDE olmalı — EN/RU sayfada Türkçe adres yazmak kanonikle çelişir. */
const S = "http://localhost:3000";

describe("itemListNode — dil", () => {
  it("liste ve öğe adresleri sayfanın dilinde", () => {
    const node = itemListNode({
      locale: "en",
      name: "Suppliers and products in Germany",
      path: "/urunler/ulke/de-almanya",
      items: [{ name: "Pipe", path: "/firma/acme/urun/boru" }],
    }) as { url: string; itemListElement: Array<{ url: string }> };
    expect(node.url).toBe(`${S}/en/products/country/de-almanya`);
    expect(node.itemListElement[0]!.url).toBe(`${S}/en/companies/acme/products/boru`);
  });

  it("dil verilmezse Türkçe (ön eksiz)", () => {
    const node = itemListNode({
      name: "Ürünler",
      path: "/urunler/sehir/istanbul",
      items: [{ name: "Boru", path: "/firma/acme/urun/boru" }],
    }) as { url: string; itemListElement: Array<{ url: string }> };
    expect(node.url).toBe(`${S}/urunler/sehir/istanbul`);
    expect(node.itemListElement[0]!.url).toBe(`${S}/firma/acme/urun/boru`);
  });

  it("şehir kırıntısı: Anasayfa › Ürünler › Ülke › Şehir, Rusça adreslerle", () => {
    const node = breadcrumbNode(
      [
        { name: "Главная", path: "/" },
        { name: "Товары", path: "/urunler" },
        { name: "Германия", path: "/urunler/ulke/de-almanya" },
        { name: "Мюнхен", path: "/urunler/sehir/de-munich" },
      ],
      "ru",
    ) as { itemListElement: Array<{ item: string }> };
    expect(node.itemListElement.map((i) => i.item)).toEqual([
      `${S}/ru`,
      `${S}/ru/tovary`,
      `${S}/ru/tovary/strana/de-almanya`,
      `${S}/ru/tovary/gorod/de-munich`,
    ]);
  });
});

describe("buildMetadata — varsayılan OG kartı", () => {
  it("görsel verilmeyen EN/RU sayfa kendi dilinin marka kartını alır", () => {
    const en = buildMetadata({ title: "x", description: "y", path: "/nasil-calisir", locale: "en" });
    expect(en.openGraph?.images).toEqual([`${S}/en/opengraph-image`]);
    expect(en.twitter?.images).toEqual([`${S}/en/opengraph-image`]);
    const tr = buildMetadata({ title: "x", description: "y", path: "/nasil-calisir" });
    expect(tr.openGraph?.images).toEqual([`${S}/opengraph-image`]);
  });

  it("segment kartı: dil ön eki + İÇ yol (çevrilmiş yol + /opengraph-image rota değil)", () => {
    expect(ogCardPath("/urunler/ulke/de-almanya", "tr")).toBe("/urunler/ulke/de-almanya/opengraph-image");
    expect(ogCardPath("/urunler/ulke/de-almanya", "en")).toBe("/en/urunler/ulke/de-almanya/opengraph-image");
    expect(ogCardPath("/", "ru")).toBe("/ru/opengraph-image");
  });
});

describe("organizationNode — destek dilleri", () => {
  it("üç dil", () => {
    const org = organizationNode() as { contactPoint: Array<{ availableLanguage: string[] }> };
    expect(org.contactPoint[0]!.availableLanguage).toEqual(["tr", "en", "ru"]);
  });
});
