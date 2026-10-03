import { createWebTranslator } from "@rothern/i18n/translator";
import { describe, expect, it } from "vitest";
import { clampDescription } from "@/lib/seo/meta";

/**
 * META AÇIKLAMASI PAKET NİTELEYİCİSİNİ KESMEZ (arayüz testi kalanlar COPY).
 *
 * Kök neden: şablonlar 165–231 karakterdi ve paket kuralı ("bilgi talebi
 * Gold", "teklif Silver") cümlenin SONUNDAYDI; `clampDescription(160)` tam
 * orada kesip "…bilgi talebi Gold, bağlantı daveti…" gibi yarım niteleyici
 * bırakıyordu. Kural: tipik adla (20 karakter) ve sayfa önekiyle ("Sayfa 2 · ")
 * niteleyici kesilmeden görünür; tek sayfalık metinler 160'a sığar.
 */
const NAME = "X".repeat(20);
const PAGE_PREFIX = { tr: "Sayfa 2 · ", en: "Page 2 · ", ru: "Страница 2 · " } as const;

describe.each(["tr", "en", "ru"] as const)("meta açıklaması sığar (%s)", (locale) => {
  const t = createWebTranslator(locale);

  it("anasayfa ve firma dizini 160 karakteri aşmaz; Silver ve Gold ikisi de görünür", () => {
    for (const text of [
      t("web.marketing.home.metaDescription"),
      t("web.marketplace.pages.companiesMetaDesc"),
    ]) {
      expect(text.length, text).toBeLessThanOrEqual(160);
      expect(clampDescription(text)).toBe(text);
      expect(text).toMatch(/Silver/);
      expect(text).toMatch(/Gold/);
    }
  });

  it("kategori/şehir/ülke: sayfalı hâlde bile Gold niteleyicisi kesilmez", () => {
    const params = { name: NAME, count: 1234 };
    for (const key of ["categoryMetaDesc", "cityMetaDescHas", "countryMetaDescHas"] as const) {
      const text = t(`web.marketplace.pages.${key}`, params);
      expect(text.length, `${key}: ${text}`).toBeLessThanOrEqual(160);
      const paged = clampDescription(`${PAGE_PREFIX[locale]}${text}`);
      // Kesim olursa yalnız sondaki vitrin cümlesinden; plan cümlesi bütün.
      // clampDescription boşlukları tekler (RU binlik ayracı NBSP dahil).
      const flat = text.replace(/\s+/g, " ");
      const planSentence = flat.slice(0, flat.indexOf("Gold") + "Gold".length);
      expect(paged.startsWith(`${PAGE_PREFIX[locale]}${planSentence}`), `${key}: ${paged}`).toBe(true);
    }
  });
});
