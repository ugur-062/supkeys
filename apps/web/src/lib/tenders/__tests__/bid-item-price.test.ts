import { describe, expect, it } from "vitest";
import {
  bidItemCurrency,
  bidItemUnitPriceTry,
  bidRateToTry,
  rankBidsForItem,
} from "../bid-item-price";

/**
 * Derin denetim Y-14: sahip ekranı kalem kıyası / kalem kazandırma ön-seçimi
 * kalemin KENDİ birimini (madde 9) ve fxToBase damgasını kullanmalı.
 */
describe("bidItemUnitPriceTry", () => {
  it("kalem ana birimde: birim × teklif kuru", () => {
    expect(
      bidItemUnitPriceTry(
        { currency: "USD", exchangeRateSnapshot: "40" },
        { unitPrice: "10" },
      ),
    ).toBe(400);
  });

  it("TRY ana birimli teklifte USD kalem: birim × fxToBase (ana birim kuru 1)", () => {
    expect(
      bidItemUnitPriceTry(
        { currency: "TRY", exchangeRateSnapshot: null },
        { unitPrice: "100", currency: "USD", fxToBase: "48.99" },
      ),
    ).toBeCloseTo(4899, 6);
  });

  it("USD ana birimli teklifte TRY kalem: çevrimsiz (şişmez)", () => {
    expect(
      bidItemUnitPriceTry(
        { currency: "USD", exchangeRateSnapshot: "40" },
        { unitPrice: "3000", currency: "TRY", fxToBase: "0.025" },
      ),
    ).toBe(3000);
  });

  it("EUR ana birim + USD kalem: birim × fxToBase × EUR kuru", () => {
    expect(
      bidItemUnitPriceTry(
        { currency: "EUR", exchangeRateSnapshot: "50" },
        { unitPrice: "10", currency: "USD", fxToBase: "0.9" },
      ),
    ).toBeCloseTo(450, 6);
  });

  it("damga eksikse kıyaslanamaz → null", () => {
    expect(
      bidItemUnitPriceTry(
        { currency: "TRY" },
        { unitPrice: "100", currency: "USD", fxToBase: null },
      ),
    ).toBeNull();
    expect(
      bidItemUnitPriceTry({ currency: "USD", exchangeRateSnapshot: null }, { unitPrice: "1" }),
    ).toBeNull();
  });

  it("bidRateToTry / bidItemCurrency", () => {
    expect(bidRateToTry({ currency: "TRY" })).toBe(1);
    expect(bidRateToTry({ currency: "EUR", exchangeRateSnapshot: "0" })).toBeNull();
    expect(bidItemCurrency({ currency: "TRY" }, { unitPrice: 1, currency: "USD" })).toBe("USD");
    expect(bidItemCurrency({ currency: "EUR" }, { unitPrice: 1, currency: null })).toBe("EUR");
  });
});

describe("rankBidsForItem", () => {
  const bids = [
    {
      id: "usd-kalem",
      bidderName: "A",
      status: "SUBMITTED",
      currency: "TRY",
      exchangeRateSnapshot: null,
      items: [{ itemId: "x", unitPrice: "100", currency: "USD", fxToBase: "48.99" }],
    },
    {
      id: "try",
      bidderName: "B",
      status: "SUBMITTED",
      currency: "TRY",
      exchangeRateSnapshot: null,
      items: [{ itemId: "x", unitPrice: "3000" }],
    },
    {
      id: "elenen",
      bidderName: "C",
      status: "LOST",
      currency: "TRY",
      items: [{ itemId: "x", unitPrice: "1" }],
    },
    {
      id: "damgasiz",
      bidderName: "D",
      status: "SUBMITTED",
      currency: "TRY",
      items: [{ itemId: "x", unitPrice: "5", currency: "EUR", fxToBase: null }],
    },
  ];

  it("100 USD'lik kalem 3.000 TRY'nin önüne geçmez; ön-seçilen gerçek en ucuz", () => {
    const opts = rankBidsForItem(bids, "x");
    expect(opts.map((o) => o.bidId)).toEqual(["try", "usd-kalem", "damgasiz"]);
    expect(opts[0]).toMatchObject({ price: 3000, currency: "TRY", priceTry: 3000 });
    // Gösterim kalemin biriminde (eskiden teklifin ana birimi: "100 ₺").
    expect(opts[1]).toMatchObject({ price: 100, currency: "USD" });
    expect(opts[1]!.priceTry).toBeCloseTo(4899, 6);
    // Kıyaslanamayan en sonda, ön-seçilmez.
    expect(opts[2]).toMatchObject({ currency: "EUR", priceTry: null });
  });

  it("fiyatsız kalem listeye girmez", () => {
    expect(rankBidsForItem(bids, "yok")).toEqual([]);
  });
});
