import { describe, expect, it } from "vitest";
import { breadcrumbNode, itemListNode, organizationNode, webSiteNode } from "../jsonld";
import { LEGAL_DOC_LOCALES, TITLE_MAX, TITLE_SUFFIX, buildMetadata, contentLangOf, ogCardPath, siteVerification, titleRoom } from "../meta";
import { clampTitle } from "../entities";

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
    // Ülke slug'ı DİLİN ADIYLA (2026-09-27): iç yol Türkçe, dış adres `de-germany`.
    expect(node.url).toBe(`${S}/en/products/country/de-germany`);
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
      `${S}/ru/tovary/strana/de-germaniya`,
      `${S}/ru/tovary/gorod/de-munich`,
    ]);
  });
});

describe("buildMetadata — varsayılan OG kartı", () => {
  it("görsel verilmeyen EN/RU sayfa kendi dilinin marka kartını alır", () => {
    const en = buildMetadata({ title: "How it works", description: "y", path: "/nasil-calisir", locale: "en" });
    // og:image:alt (sayfanın dilinde, başlık) + kartın bilinen boyutu.
    expect(en.openGraph?.images).toEqual([{ url: `${S}/en/opengraph-image`, alt: "How it works", width: 1200, height: 630 }]);
    expect(en.twitter?.images).toEqual([{ url: `${S}/en/opengraph-image`, alt: "How it works" }]);
    const tr = buildMetadata({ title: "x", description: "y", path: "/nasil-calisir" });
    expect(tr.openGraph?.images).toEqual([{ url: `${S}/opengraph-image`, alt: "x", width: 1200, height: 630 }]);
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

describe("buildMetadata — hazır diller, sayfalama, sözleşmeler (2026-09-27)", () => {
  it("hreflang YALNIZ hazır diller; x-default hazır ilk dile; og:locale:alternate aynı set", () => {
    const m = buildMetadata({ title: "Pipe", description: "y", path: "/firma/acme/urun/boru", locale: "en", locales: ["en", "ru"] });
    expect(m.alternates?.languages).toEqual({
      en: `${S}/en/companies/acme/products/boru`,
      ru: `${S}/ru/kompanii/acme/tovary/boru`,
      "x-default": `${S}/en/companies/acme/products/boru`,
    });
    expect(m.alternates?.canonical).toBe(`${S}/en/companies/acme/products/boru`);
    expect((m.openGraph as { alternateLocale?: string[] }).alternateLocale).toEqual(["ru_RU"]);
  });

  it("çevirisi bekleyen (noindex) dil kendi adresini kanonik söyler ama hreflang'e girmez", () => {
    const m = buildMetadata({ title: "x", description: "y", path: "/firma/acme", locale: "ru", locales: ["tr"], noindex: true });
    expect(m.alternates?.canonical).toBe(`${S}/ru/kompanii/acme`);
    expect(m.alternates?.languages).toEqual({ tr: `${S}/firma/acme`, "x-default": `${S}/firma/acme` });
  });

  it("sözleşme metni: EN/RU sayfanın kanoniği Türkçe, hreflang yalnız tr", () => {
    const m = buildMetadata({ title: "Terms", description: "y", path: "/sozlesmeler/kullanici", locale: "en", locales: LEGAL_DOC_LOCALES });
    expect(m.alternates?.canonical).toBe(`${S}/sozlesmeler/kullanici`);
    expect(m.alternates?.languages).toEqual({ tr: `${S}/sozlesmeler/kullanici`, "x-default": `${S}/sozlesmeler/kullanici` });
  });

  it("sayfalama: N>1 kendi kanoniği ve hreflang'i `?sayfa=N`; 1. sayfa sorgusuz", () => {
    const p2 = buildMetadata({ title: "x", description: "y", path: "/urunler/ulke/de-almanya", locale: "en", page: 2 });
    expect(p2.alternates?.canonical).toBe(`${S}/en/products/country/de-germany?sayfa=2`);
    expect((p2.alternates?.languages as Record<string, string>).ru).toBe(`${S}/ru/tovary/strana/de-germaniya?sayfa=2`);
    const p1 = buildMetadata({ title: "x", description: "y", path: "/urunler", page: 1 });
    expect(p1.alternates?.canonical).toBe(`${S}/urunler`);
  });

  it("sayfalama: N>1 başlık ve açıklama yerelleştirilmiş sayfa eki taşır, 1. sayfa eksiz (arayüz testi D-084)", () => {
    const p2 = buildMetadata({ title: "Products", description: "All products.", path: "/urunler", locale: "en", page: 2, pageLabel: "Page 2" });
    expect(p2.title).toBe("Products — Page 2");
    expect(p2.description).toBe("Page 2 · All products.");
    expect(p2.openGraph?.title).toBe("Products — Page 2");
    const p1 = buildMetadata({ title: "Products", description: "All products.", path: "/urunler", locale: "en", page: 1, pageLabel: "Page 1" });
    expect(p1.title).toBe("Products");
    expect(p1.description).toBe("All products.");
  });

  it("sayfalama: ` — Sayfa N` eki başlığı 75 tavanının dışına itmez (arayüz testi webA-13 gözden geçirme)", () => {
    const name = "Endüstriyel Otomasyon ve Kontrol Sistemleri Yedek Parça ve Sarf Malzemeleri";
    const tail = "1.234 ürün";
    for (const [locale, label] of [["tr", "Sayfa 12"], ["en", "Page 12"], ["ru", "Страница 12"]] as const) {
      const p1 = buildMetadata({ title: clampTitle(name, tail, titleRoom(1, label)), description: "d", path: "/urunler", locale, page: 1, pageLabel: label });
      expect(String(p1.title).length + TITLE_SUFFIX.length).toBeLessThanOrEqual(TITLE_MAX);
      // Kategori sayfası gibi bütçeyle kırpan çağıran: kuyruk düşer, ad kısalır, ek korunur.
      const p12 = buildMetadata({ title: clampTitle(name, tail, titleRoom(12, label)), description: "d", path: "/urunler", locale, page: 12, pageLabel: label });
      expect(String(p12.title).endsWith(` — ${label}`)).toBe(true);
      expect(String(p12.title)).not.toContain(tail);
      expect(String(p12.title).length + TITLE_SUFFIX.length).toBeLessThanOrEqual(TITLE_MAX);
      // Bütçeyi bilmeyen çağıran: buildMetadata taban başlığı kendisi kısaltır.
      const raw = buildMetadata({ title: clampTitle(name, tail), description: "d", path: "/urunler", locale, page: 12, pageLabel: label });
      expect(String(raw.title).endsWith(` — ${label}`)).toBe(true);
      expect(String(raw.title).length + TITLE_SUFFIX.length).toBeLessThanOrEqual(TITLE_MAX);
    }
  });
});

describe("içerik dili ve site düğümü (2026-09-27)", () => {
  it("contentLangOf: yalnız sayfa dili hazır DEĞİLSE kaynağın dili; bilinmeyen kaynak yazılmaz", () => {
    expect(contentLangOf({ readyLocales: ["tr", "en"], sourceLocale: "tr" }, "en")).toBeUndefined();
    expect(contentLangOf({ readyLocales: ["tr"], sourceLocale: "tr" }, "ru")).toBe("tr");
    expect(contentLangOf({ readyLocales: ["en"], sourceLocale: "de" }, "tr")).toBe("de");
    expect(contentLangOf({ readyLocales: [], sourceLocale: "und" }, "en")).toBeUndefined();
    expect(contentLangOf({}, "en")).toBeUndefined();
  });

  it("SearchAction adresi sayfanın dilinde", () => {
    const node = webSiteNode("ru") as { potentialAction: { target: { urlTemplate: string } } };
    expect(node.potentialAction.target.urlTemplate).toBe(`${S}/ru/tovary?q={search_term_string}`);
  });

  it("doğrulama meta etiketleri: Google, Bing, Yandex; boşlar yazılmaz", () => {
    expect(siteVerification({})).toEqual({});
    expect(siteVerification({ yandex: "abc", google: " " })).toEqual({ verification: { yandex: "abc" } });
    expect(siteVerification({ google: "g", bing: "b", yandex: "y" })).toEqual({
      verification: { google: "g", yandex: "y", other: { "msvalidate.01": "b" } },
    });
  });
});
