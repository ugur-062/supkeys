// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Arayüz dili test başına (`vitest.setup.ts` sahtesi hep "tr" döner).
let currentLocale = "tr";
vi.mock("next-intl", () => ({ useLocale: () => currentLocale }));

import { Money, axisScaleMax, formatAxisMoney, formatCompactMoney, formatMoney, moneyParts } from "../money";

afterEach(() => {
  currentLocale = "tr";
});

/**
 * 2026-09-27 — para gösterimi ARAYÜZ DİLİNDE. tr-TR sabitken İngilizce
 * arayüzde "1.234,56 $" ve kısa gösterimde "208,2 B €" basılıyordu (İngilizce
 * okur "B"yi billion sanar; Türkçede bin).
 */
describe("formatMoney — dilin sayı biçimi, sembol sonda", () => {
  it("TR / EN / RU", () => {
    expect(formatMoney(1234.5, "TRY", "tr")).toBe("1.234,50 ₺");
    expect(formatMoney(1234.5, "USD", "en")).toBe("$1,234.50");
    // İngilizcede sembol önde; harfli kodda boşluklu.
    expect(formatMoney(1234.5, "CHF", "en")).toBe("CHF 1,234.50");
    expect(formatMoney(-50, "EUR", "en")).toBe("-€50.00");
    expect(formatMoney("1234.5", "EUR", "ru")).toBe("1 234,50 €");
  });

  it("geçersiz değer tire", () => {
    expect(formatMoney("abc", "TRY", "en")).toBe("—");
  });
});

describe("formatCompactMoney — kısaltma DİLİN kısaltması", () => {
  it("EN 'K', TR 'B', RU 'тыс.'", () => {
    expect(formatCompactMoney(208_200, "EUR", "en")).toBe("€208.2K");
    expect(formatCompactMoney(208_200, "EUR", "tr")).toBe("208,2\u00A0B €");
    expect(formatCompactMoney(208_200, "EUR", "ru")).toBe("208,2 тыс. €");
  });

  it("10.000 altı kısaltılmaz, kuruşsuz", () => {
    expect(formatCompactMoney(9_999.4, "TRY", "en")).toBe("₺9,999");
    expect(formatCompactMoney(9_999.4, "TRY", "tr")).toBe("9.999 ₺");
  });
});

/**
 * Arayüz testi son tur — Nakit Takvimi ekseni "0 ₺, 9.000 ₺, 18 B ₺, 27 B ₺"
 * okuyordu: tik başına kısaltma eşiği aynı eksende iki gösterim üretiyordu.
 */
describe("formatAxisMoney — bir eksen tek gösterim", () => {
  it("10.000+ ölçekte 10.000 altı tikler de kısaltılır", () => {
    const ticks = [0, 9_000, 18_000, 27_000, 36_000].map((v) => formatAxisMoney(v, "TRY", "tr", 36_000));
    expect(ticks).toEqual(["0 ₺", "9\u00A0B ₺", "18\u00A0B ₺", "27\u00A0B ₺", "36\u00A0B ₺"]);
    expect(formatAxisMoney(9_000, "USD", "en", 36_000)).toBe("$9K");
  });

  it("10.000 altı ölçekte hepsi kuruşsuz tam", () => {
    const ticks = [0, 2_500, 5_000, 7_500, 10_000].map((v) => formatAxisMoney(v, "TRY", "tr", 9_200));
    expect(ticks).toEqual(["0 ₺", "2.500 ₺", "5.000 ₺", "7.500 ₺", "10.000 ₺"]);
  });

  it("axisScaleMax en büyük mutlak değer; boş/geçersiz 0", () => {
    expect(axisScaleMax([1_000, -40_000, 12_000])).toBe(40_000);
    expect(axisScaleMax([])).toBe(0);
    expect(axisScaleMax([null, undefined, Number.NaN])).toBe(0);
  });
});

describe("Money — kuruş ayracı dilden", () => {
  it("moneyParts ondalık ayracını dilden alır", () => {
    expect(moneyParts(1234.5, "en")).toEqual({ int: "1,234", decimal: ".", frac: "50" });
    expect(moneyParts(1234.5, "tr")).toEqual({ int: "1.234", decimal: ",", frac: "50" });
  });

  it("EN arayüzde $1,234.50 (sembol önde)", () => {
    currentLocale = "en";
    const { container } = render(<Money value={1234.5} currency="USD" />);
    expect(container.textContent).toBe("$1,234.50");
  });

  it("TR arayüzde 1.234,50 ₺ (değişmedi)", () => {
    const { container } = render(<Money value="1234.5" />);
    expect(container.textContent).toBe("1.234,50 ₺");
  });
});
