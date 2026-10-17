import { describe, expect, it } from "vitest";
import { LOCALES } from "../locales";
import { rawMessages, type MessageTree } from "../messages";

/**
 * Kayıt sihirbazı ve Firma Bilgileri › Kategoriler metinleri (kayıt arayüz
 * testi 2026-10, ikinci tur: D-01, CAT-D1).
 */
function at(tree: MessageTree, path: string): string {
  const node = path
    .split(".")
    .reduce<MessageTree | string | undefined>((acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined), tree);
  if (typeof node !== "string") throw new Error(`katalogda yok: ${path}`);
  return node;
}

/**
 * D-01 — "DİĞER" KUTUSUNUN YER TUTUCUSU KUTUSUNA SIĞAR.
 *
 * Hukuki yapı "Diğer" seçilince açılan serbest metin kutusunun yer tutucusu
 * kutudan uzundu ve kesiliyordu (örnekler okunmuyordu): Rusça 390 px'te 544 px
 * metin / 290 px yer, İngilizce 428 / 290, Türkçe 322 / 290; masaüstünde kutu
 * yarım genişlikte (270 px).
 *
 * Kutunun metin için yeri (sihirbazın gerçek kutusunda ölçüldü):
 *   1280 px → 270 px (14 px yazı) · 390 px → 290 px (16 px) · 360 px → 260 px (16 px)
 *   tam 640 px → 254 px ve 16 px yazı (iki sütun kuralı `min-width: 640px` ile
 *   telefon yazı boyutu kuralı `max-width: 640px` yalnız bu genişlikte çakışır;
 *   641 px'ten itibaren yazı 14 px).
 * Ölçüm (Chromium, derlemenin Inter yazı tipi, 16 px, 2026-10-08) — yeni
 * metinlerin hepsi dört genişlikte de sığıyor (en dar pay: Rusça, 640 px'te 3 px):
 *   tr  "Yerel adıyla yazın (ör. vakıf)" 213 · "ör. kooperatif, adi ortaklık" 195
 *       · "ör. GmbH, LLC, kooperatif" 201
 *   en  "Local name (e.g. foundation)" 218 · "e.g. kooperatif, adi ortaklık" 201
 *       · "e.g. GmbH, LLC, cooperative" 219
 *   ru  "Местное название, напр. фонд" 251 · "напр. kooperatif, adi ortaklık" 218
 *       · "напр. GmbH, LLC, кооператив" 242
 *
 * BEKÇİ KABADIR (yazı tipi ölçemez): Kiril harf Latin harften ≈ 1,2 kat geniştir
 * (16 px'te ≈ 9 px'e karşı ≈ 7,6 px). Ağırlıklı uzunluk = Kiril harf × 1,2 +
 * diğer karakterler; 34 birim ≈ 258 px. Ölçülen 18 metinde (eski + yeni) kural
 * gerçekle örtüşüyor: 390 px'te kesilen eski metinlerin hepsi 34'ü aşıyor, sığan
 * metinlerin hepsi altında. Metin değişirse tarayıcıda yeniden ölçülür.
 */
const PLACEHOLDERS = [
  "auth.onboarding.legalFormLocalPlaceholder",
  "auth.onboarding.legalFormLocalPlaceholderTr",
  "auth.onboarding.legalFormLocalPlaceholderListed",
] as const;
const PLACEHOLDER_BUDGET = 34;

function weightedLength(text: string): number {
  let units = 0;
  for (const ch of text) units += /\p{Script=Cyrillic}/u.test(ch) ? 1.2 : 1;
  return units;
}

describe("onboarding — 'Diğer' hukuki yapı kutusunun yer tutucusu kutusuna sığar (D-01)", () => {
  it.each(LOCALES)("%s: üç yer tutucu da kutusuna sığacak kadar kısa (360 px'lik ekran dahil)", (locale) => {
    const web = rawMessages(locale, "web");
    const tooLong = PLACEHOLDERS.map((key) => [key, at(web, key)] as const).filter(
      ([, text]) => weightedLength(text) > PLACEHOLDER_BUDGET,
    );
    expect(tooLong).toEqual([]);
  });

  it("bekçi ölçümle örtüşür: kesilen eski metinler bütçeyi aşar", () => {
    for (const clipped of [
      "Yerel adıyla yazın (ör. vakıf, dernek, şube)",
      "ör. kooperatif, kollektif şirket, adi ortaklık",
      "Use its local name (e.g. foundation, association, branch)",
      "Укажите местное название (например, фонд, ассоциация, филиал)",
      "например, GmbH, LLC, S.A., кооператив",
    ]) {
      expect([clipped, weightedLength(clipped) > PLACEHOLDER_BUDGET]).toEqual([clipped, true]);
    }
  });

  it("yer tutucu yine örnek verir (yalnız kısalır)", () => {
    const EXAMPLE = { tr: /ör\. \S/, en: /e\.g\. \S/, ru: /напр\. \S/ };
    for (const locale of LOCALES) {
      const web = rawMessages(locale, "web");
      for (const key of PLACEHOLDERS) {
        expect([locale, key, at(web, key)]).toEqual([locale, key, expect.stringMatching(EXAMPLE[locale])]);
      }
    }
  });
});

/**
 * CAT-D1 — Firma Bilgileri › Kategoriler giriş metni PENCERENİN BUGÜN YAPTIĞINI
 * söyler. Kategori penceresinde sektör satırı da işaretlenebiliyor (2026-10-08:
 * sektörün tamamı ya da altındaki ürün ve hizmetler); giriş metni hâlâ "somut
 * ürün/hizmetlerinizi seçin — sektörünüz seçiminizden otomatik belirlenir"
 * diyordu, hemen altındaki seçici ise "Sektörün tamamını da seçebilirsiniz".
 */
describe("Firma Bilgileri › Kategoriler giriş metni (CAT-D1)", () => {
  const KEY = "panel.settings.companyProfileSection.talepEslesmesiOnerilerVeBildirimler";
  const WHOLE_INDUSTRY = { tr: /sektörün tamamını/i, en: /whole industry/i, ru: /отрасль целиком|всю отрасль/i };
  const PRODUCTS_UNDER_IT = { tr: /altındaki ürün ve hizmet/i, en: /products and services under it/i, ru: /товары и услуги внутри/i };
  const DERIVED_AUTOMATICALLY = { tr: /otomatik/i, en: /automatic/i, ru: /автоматическ/i };

  it.each(LOCALES)("%s: sektörün tamamı ya da altındaki ürün ve hizmetler; 'otomatik belirlenir' demez", (locale) => {
    const text = at(rawMessages(locale, "web"), KEY);
    expect(text).toMatch(WHOLE_INDUSTRY[locale]);
    expect(text).toMatch(PRODUCTS_UNDER_IT[locale]);
    expect(text).not.toMatch(DERIVED_AUTOMATICALLY[locale]);
  });
});
