import { describe, expect, it } from "vitest";
import { COUNTRY_SLUG_CODES, localizedCountrySlug } from "@rothern/i18n";
import { COUNTRY_TABLE, countryProductPath, countrySlug } from "@rothern/shared";
import { localizePath, stripLocale } from "../href";

/* Ülke sayfası adresi üç dilde (2026-09-27 SEO denetimi): EN/RU adreste
   Türkçe ad (`/en/products/country/de-almanya`) yerine dilin adı. Tablo
   `@rothern/i18n` `country-slugs.ts`te STATİK; Türkçe sütun paylaşılan ülke
   listesinden üretilen iç slug'la birebir olmalı — ayrışırsa Türkçe ülke
   sayfası kendi bağlantısına 308 verirdi. */
describe("ülke slug tablosu ↔ paylaşılan ülke listesi", () => {
  it("245 ülkenin tamamı tabloda; Türkçe sütun `countrySlug` ile aynı", () => {
    const codes = COUNTRY_TABLE.map(([code]) => code);
    expect([...COUNTRY_SLUG_CODES].sort()).toEqual([...codes].sort());
    for (const cc of codes) expect(localizedCountrySlug(cc, "tr")).toBe(countrySlug(cc));
  });

  it("kanonik/sitemap/hreflang adresi: iç yol → dilin adıyla dış adres, geri dönüş Türkçe iç yol", () => {
    const inner = countryProductPath("DE");
    expect(inner).toBe("/urunler/ulke/de-almanya");
    expect(localizePath(inner, "en")).toBe("/en/products/country/de-germany");
    expect(localizePath(inner, "ru")).toBe("/ru/tovary/strana/de-germaniya");
    expect(localizePath(inner, "tr")).toBe("/urunler/ulke/de-almanya");
    expect(stripLocale("/en/products/country/de-germany")).toBe(inner);
    expect(stripLocale("/ru/tovary/strana/de-germaniya")).toBe(inner);
  });
});
