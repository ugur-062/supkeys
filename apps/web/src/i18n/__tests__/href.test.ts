import { describe, expect, it } from "vitest";
import { localizePath, localizedAlternates, splitLocale, stripLocale } from "../href";

describe("href — yol parçaları dile göre (2026-09-24)", () => {
  it("localizePath: iç yol → ön ekli dış yol; Türkçe ön eksiz ve değişmez", () => {
    expect(localizePath("/urunler", "tr")).toBe("/urunler");
    expect(localizePath("/urunler", "en")).toBe("/en/products");
    expect(localizePath("/urunler", "ru")).toBe("/ru/tovary");
    expect(localizePath("/", "ru")).toBe("/ru");
    expect(localizePath("/company/login", "ru")).toBe("/ru/kompaniya/vhod");
    expect(localizePath("/firma/acme/urun/boru?x=1", "en")).toBe("/en/companies/acme/products/boru?x=1");
    expect(localizePath("/api/health", "en")).toBe("/en/api/health");
  });

  it("splitLocale/stripLocale: dış adres → dil + iç yol; kanonik olmayan biçim de tanınır", () => {
    expect(splitLocale("/en/products")).toEqual({ locale: "en", path: "/urunler" });
    expect(splitLocale("/ru/kompaniya/vhod?next=1")).toEqual({ locale: "ru", path: "/company/login?next=1" });
    expect(splitLocale("/en/urunler")).toEqual({ locale: "en", path: "/urunler" });
    expect(splitLocale("/urunler")).toEqual({ locale: "tr", path: "/urunler" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(stripLocale("/en/companies/acme")).toBe("/firma/acme");
    expect(stripLocale("/company/mesajlar")).toBe("/company/mesajlar");
  });

  it("localizedAlternates: hreflang her dilin kendi dış adresi, x-default Türkçe", () => {
    expect(localizedAlternates("/urunler/sehir/izmir")).toEqual({
      tr: "/urunler/sehir/izmir",
      en: "/en/products/city/izmir",
      ru: "/ru/tovary/gorod/izmir",
      "x-default": "/urunler/sehir/izmir",
    });
  });
});
