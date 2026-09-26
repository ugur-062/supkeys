import { describe, expect, it } from "vitest";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { createTranslator } from "use-intl/core";
import { productPrice, type PriceLabels } from "./product-price";

const base = { priceCurrency: "TRY", unit: "adet" };

// Etiketler ÇAĞIRANDAN gelir (modülde Türkçe yedek yok) — testte de tek
// kaynaktan, TR katalogdan kurulur; metin katalogda değişirse test onu görür.
const t = createTranslator({
  locale: "tr",
  messages: messagesFor("tr", WEB_NAMESPACES),
  timeZone: "Europe/Istanbul",
}) as unknown as (key: string, values?: Record<string, string | number>) => string;

const labels: PriceLabels = {
  locale: "tr-TR",
  onRequest: t("web.marketplace.price.onRequest"),
  fromQty: (qty, unit) => t("web.marketplace.price.fromQty", { qty, unit }),
};

describe("ürün fiyat gösterimi", () => {
  it("sabit fiyatı birim ile gösterir", () => {
    const r = productPrice({ ...base, priceMode: "FIXED", priceAmount: "450", priceTiers: null }, labels);
    expect(r.headline).toBe("450 ₺ / adet");
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
    }, labels);
    expect(r.headline).toBe("420 ₺ / adet");
    expect(r.note).toBe("500 adet ve üzeri için");
    expect(r.tiers?.map((t) => t.minQty)).toEqual([1, 100, 500]); // sıralı
  });

  it("teklif isteyin — boş değil, TAM CÜMLE", () => {
    const r = productPrice({ ...base, priceMode: "ON_REQUEST", priceAmount: null, priceTiers: null }, labels);
    expect(r.headline).toBe("Fiyat için teklif isteyin");
    expect(r.hasPrice).toBe(false);
  });

  it("mod FIXED ama tutar yoksa teklif-isteyin'e düşer (uydurmaz)", () => {
    const r = productPrice({ ...base, priceMode: "FIXED", priceAmount: null, priceTiers: null }, labels);
    expect(r.hasPrice).toBe(false);
  });

  it("mod TIERED ama tablo boşsa teklif-isteyin'e düşer", () => {
    const r = productPrice({ ...base, priceMode: "TIERED", priceAmount: null, priceTiers: [] }, labels);
    expect(r.hasPrice).toBe(false);
  });
});
