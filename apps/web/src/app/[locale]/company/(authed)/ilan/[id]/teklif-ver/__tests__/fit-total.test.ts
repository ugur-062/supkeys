import { describe, expect, it } from "vitest";
import { MONEY_CHAR_EM, fitMoneyFontSize } from "../fit-total";

/**
 * Mobil denetim 2026-10 (1024 + sabit kenar çubuğu): sağ kolondaki toplam
 * kartının iç genişliği 181 px; 24 px'lik "1.800.000.000,00 ₺" (≈ 237 px)
 * kartı ve sayfayı taşırıyordu. Tutar bölünmez; yazı boyu kutuya göre küçülür.
 */
describe("fitMoneyFontSize", () => {
  it("en uzun BÖLÜNMEZ parçaya göre kapsayıcı birimiyle (cqi) clamp üretir; üst sınır sınıfın boyu", () => {
    expect(fitMoneyFontSize(["1.800.000.000,00 ₺"], { max: 1.5, min: 0.875 })).toBe(
      `clamp(0.875rem, calc(100cqi / ${Number((18 * MONEY_CHAR_EM).toFixed(2))}), 1.5rem)`,
    );
    // Karma birimli toplam " + " ayracında sarar → en uzun parça belirler.
    expect(fitMoneyFontSize(["1.550,00 €", "3.400.000,00 ₺"], { max: 1, min: 0.75 })).toBe(
      `clamp(0.75rem, calc(100cqi / ${Number((14 * MONEY_CHAR_EM).toFixed(2))}), 1rem)`,
    );
    expect(fitMoneyFontSize([], { max: 1.5, min: 0.875 })).toBeUndefined();
    expect(fitMoneyFontSize([""], { max: 1.5, min: 0.875 })).toBeUndefined();
  });

  it("ölçülen yerleşimde sığar: 1024 + kenar çubuğunda 181 px'lik kartta 18 karakterlik tutar ≤ 24 px ve kutuya sığar", () => {
    // Inter kalın tabular rakam: 24 px'te "2.226.123.206,00 ₺" 236 px ölçüldü (0,546 em/karakter).
    const measuredEm = 236 / 24 / 18;
    expect(MONEY_CHAR_EM).toBeGreaterThan(measuredEm);
    const inner = 181;
    const fontPx = Math.min(24, Math.max(14, inner / (18 * MONEY_CHAR_EM)));
    expect(fontPx * measuredEm * 18).toBeLessThanOrEqual(inner);
    // Kısa tutarda (masaüstü 1280 kartı 261 px, telefon 318 px) boy değişmez.
    expect(Math.min(24, 261 / (14 * MONEY_CHAR_EM))).toBe(24);
  });
});
