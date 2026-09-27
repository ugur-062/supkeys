import { describe, expect, it } from "vitest";
import { CURRENCY_CODES } from "@rothern/shared";
import { CURRENCIES, CURRENCY_SYMBOL, affixCurrency } from "../labels";

describe("etiketler", () => {
  it("CURRENCY_SYMBOL temel birimleri içerir", () => {
    expect(CURRENCY_SYMBOL.TRY).toBe("₺");
    expect(CURRENCY_SYMBOL.USD).toBe("$");
    expect(CURRENCY_SYMBOL.EUR).toBe("€");
  });

  it("her desteklenen birimin sembolü var ve semboller TEKİL (¥ belirsizliği yok)", () => {
    expect(CURRENCIES).toEqual([...CURRENCY_CODES]);
    for (const c of CURRENCY_CODES) expect(CURRENCY_SYMBOL[c]).toBeTruthy();
    const symbols = Object.values(CURRENCY_SYMBOL);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(CURRENCY_SYMBOL.JPY).toBe("JP¥");
    expect(CURRENCY_SYMBOL.CNY).toBe("CN¥");
  });
});

describe("affixCurrency — sembolün yeri dilden", () => {
  it("İngilizcede önde, harfli kodda boşluklu, eksi işareti başta", () => {
    expect(affixCurrency("1,200.00", "USD", "en")).toBe("$1,200.00");
    expect(affixCurrency("208.2K", "EUR", "en-US")).toBe("€208.2K");
    expect(affixCurrency("1,200.00", "CHF", "en")).toBe("CHF 1,200.00");
    expect(affixCurrency("-50.00", "EUR", "en")).toBe("-€50.00");
    expect(affixCurrency("1,000", "JPY", "en")).toBe("JP¥1,000");
  });
  it("Türkçe ve Rusçada sonda", () => {
    expect(affixCurrency("1.200,00", "TRY", "tr")).toBe("1.200,00 ₺");
    expect(affixCurrency("1 200,00", "RUB", "ru-RU")).toBe("1 200,00 ₽");
    expect(affixCurrency("1.200", "XYZ", "tr")).toBe("1.200 XYZ");
  });
});

