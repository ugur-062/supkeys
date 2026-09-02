import { describe, expect, it } from "vitest";
import { productPrice } from "./product-price";

const base = { priceCurrency: "TRY", unit: "adet" };

describe("ürün fiyat gösterimi", () => {
  it("sabit fiyatı birim ile gösterir", () => {
    const r = productPrice({ ...base, priceMode: "FIXED", priceAmount: "450", priceTiers: null });
    expect(r.headline).toBe("450 TRY / adet");
    expect(r.hasPrice).toBe(true);
  });

  it("kademeli tabloda EN DÜŞÜK fiyatı gösterir ve KOŞULUNU söyler", () => {
    // Koşulu gizleyip sadece en düşüğü yazmak "gönderen 1,00 €" yanıltmasının
    // aynısı olurdu — not satırı zorunlu.
    const r = productPrice({
      ...base,
      priceMode: "TIERED",
      priceAmount: null,
      priceTiers: [
        { minQty: 1, unitPrice: 480 },
        { minQty: 500, unitPrice: 420 },
        { minQty: 100, unitPrice: 450 },
      ],
    });
    expect(r.headline).toBe("420 TRY / adet");
    expect(r.note).toBe("500 adet ve üzeri için");
    expect(r.tiers?.map((t) => t.minQty)).toEqual([1, 100, 500]); // sıralı
  });

  it("teklif isteyin — boş değil, TAM CÜMLE", () => {
    const r = productPrice({ ...base, priceMode: "ON_REQUEST", priceAmount: null, priceTiers: null });
    expect(r.headline).toBe("Fiyat için teklif isteyin");
    expect(r.hasPrice).toBe(false);
  });

  it("mod FIXED ama tutar yoksa teklif-isteyin'e düşer (uydurmaz)", () => {
    const r = productPrice({ ...base, priceMode: "FIXED", priceAmount: null, priceTiers: null });
    expect(r.hasPrice).toBe(false);
  });

  it("mod TIERED ama tablo boşsa teklif-isteyin'e düşer", () => {
    const r = productPrice({ ...base, priceMode: "TIERED", priceAmount: null, priceTiers: [] });
    expect(r.hasPrice).toBe(false);
  });
});
