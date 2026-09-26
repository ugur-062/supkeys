import { createWebTranslator } from "@rothern/i18n/translator";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { describe, expect, it } from "vitest";
import { PRICING_NOTE, PRICING_PLANS } from "../plans";

/**
 * PAKET METNİ PARİTESİ (i18n Faz 1): panel `PRICING_PLANS`in Türkçe metnini,
 * pazarlama sayfası katalogdaki `web.pricing.plans.*` anahtarlarını basar.
 * İkisi ayrışırsa aynı paket iki yerde farklı özellik listesiyle görünür —
 * bu test Türkçe katalog ile `plans.ts`i birebir tutar (özellik sayısı dahil).
 */
describe("web.pricing kataloğu ⇔ plans.ts", () => {
  const t = createWebTranslator("tr");

  it("ad, slogan, çağrı ve özellikler birebir", () => {
    for (const p of PRICING_PLANS) {
      expect(t(`web.pricing.plans.${p.slug}.name`)).toBe(p.name);
      expect(t(`web.pricing.plans.${p.slug}.tagline`)).toBe(p.tagline);
      expect(t(`web.pricing.plans.${p.slug}.cta`)).toBe(p.cta);
      p.features.forEach((f, i) => {
        expect(
          t(`web.pricing.plans.${p.slug}.f${i + 1}` as never, { n: PRODUCT_LIMITS.STANDART } as never),
          `${p.slug} f${i + 1}`,
        ).toBe(f);
      });
      // Katalogda FAZLA özellik de olmasın (hook `features.length` kadar okur).
      expect(t.has(`web.pricing.plans.${p.slug}.f${p.features.length + 1}` as never)).toBe(false);
    }
    expect(t("web.pricing.note")).toBe(PRICING_NOTE);
  });
});
