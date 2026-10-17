import { createWebTranslator } from "@rothern/i18n/translator";
import { describe, expect, it } from "vitest";
import { clampDescription } from "@/lib/seo/meta";

/**
 * META AÇIKLAMASI ERİŞİM NİTELEYİCİSİNİ KESMEZ (arayüz testi kalanlar COPY).
 *
 * Kök neden: şablonlar 165–231 karakterdi ve erişim kuralı cümlenin
 * SONUNDAYDI; `clampDescription(160)` tam orada kesip yarım niteleyici
 * bırakıyordu. Kural: tipik adla (20 karakter) ve sayfa önekiyle ("Sayfa 2 · ")
 * niteleyici kesilmeden görünür; tek sayfalık metinler 160'a sığar.
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): niteleyici artık paket adı değil FİRMA
 * DOĞRULAMASI ("bilgi talebi firma doğrulamasıyla"); hiçbir meta açıklamasında
 * paket adı geçmez. Anasayfa doğrulamadan söz etmez — talep açmanın ve teklif
 * vermenin tamamen ücretsiz olduğunu söyler.
 */
const PACKAGE_WORDS = /Gold|Silver|paket|package|пакет|premium/i;
/** Erişim niteleyicisinin SON sözcükleri (cümle bununla biter). */
const VERIFY_QUALIFIER = { tr: "firma doğrulamasıyla", en: "company verification", ru: "проверки компании" } as const;
const VERIFY_WORD = { tr: /doğrula/i, en: /verif/i, ru: /проверк/i } as const;
const FREE_WORD = { tr: /tamamen ücretsiz/, en: /completely free/, ru: /совершенно бесплатно/ } as const;
const NAME = "X".repeat(20);
const PAGE_PREFIX = { tr: "Sayfa 2 · ", en: "Page 2 · ", ru: "Страница 2 · " } as const;

describe.each(["tr", "en", "ru"] as const)("meta açıklaması sığar (%s)", (locale) => {
  const t = createWebTranslator(locale);

  it("anasayfa ve firma dizini 160 karakteri aşmaz; paket adı yok — anasayfa 'tamamen ücretsiz', dizin firma doğrulaması der", () => {
    const home = t("web.marketing.home.metaDescription");
    const companies = t("web.marketplace.pages.companiesMetaDesc");
    for (const text of [home, companies]) {
      expect(text.length, text).toBeLessThanOrEqual(160);
      expect(clampDescription(text)).toBe(text);
      expect(text).not.toMatch(PACKAGE_WORDS);
    }
    expect(home).toMatch(FREE_WORD[locale]);
    expect(companies).toMatch(VERIFY_WORD[locale]);
  });

  it("kategori/şehir/ülke: sayfalı hâlde bile doğrulama niteleyicisi kesilmez", () => {
    const params = { name: NAME, count: 1234 };
    for (const key of ["categoryMetaDesc", "cityMetaDescHas", "countryMetaDescHas"] as const) {
      const text = t(`web.marketplace.pages.${key}`, params);
      expect(text.length, `${key}: ${text}`).toBeLessThanOrEqual(160);
      const paged = clampDescription(`${PAGE_PREFIX[locale]}${text}`);
      // Kesim olursa yalnız sondaki vitrin cümlesinden; plan cümlesi bütün.
      // clampDescription boşlukları tekler (RU binlik ayracı NBSP dahil).
      const flat = text.replace(/\s+/g, " ");
      const qualifier = VERIFY_QUALIFIER[locale];
      expect(flat, `${key}: ${flat}`).toContain(qualifier);
      expect(flat).not.toMatch(PACKAGE_WORDS);
      const planSentence = flat.slice(0, flat.indexOf(qualifier) + qualifier.length);
      expect(paged.startsWith(`${PAGE_PREFIX[locale]}${planSentence}`), `${key}: ${paged}`).toBe(true);
    }
  });
});
