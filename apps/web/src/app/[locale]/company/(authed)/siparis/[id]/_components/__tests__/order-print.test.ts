import { describe, expect, it } from "vitest";

import { buildOrderPrintHtml, itemBrandLine, type OrderPrintLabels } from "../order-print";

const baseOrder = {
  number: "ORD-2026-0001",
  createdAt: "2026-07-16T10:00:00.000Z",
  counterparty: "Test Firma",
  listingTitle: "Çelik alımı",
  listingNumber: "IHL-1",
  amount: 1000,
  expectedDeliveryDate: null,
  items: [
    { name: "Boru", unit: "adet", quantity: 5, unitPrice: 200, deliveryDate: null },
  ],
};
/* i18n Faz 2: etiketler PARAMETRE (saf fonksiyon hook çağıramaz) — katalog
   `web.panel.trade.siparisIdPage.print.*`, burada Türkçe kaynak değerleri. */
const labels: OrderPrintLabels = {
  order: "Sipariş",
  buyer: "Alıcı",
  seller: "Satıcı",
  request: "Satın Alma Talebi",
  status: "Durum",
  item: "Kalem",
  quantity: "Miktar",
  delivery: "Teslim",
  unit: "Birim",
  amount: "Tutar",
  noItems: "Kalem yok",
  total: "Toplam",
  general: "(genel)",
  alternative: "Muadil",
  offered: "Teklif edilen",
  requested: "İstenen",
  notSpecified: "belirtilmedi",
  deliveryAddress: "Teslim adresi",
  paymentTerms: "Ödeme şartı",
  invoiceNo: "Fatura no",
};
const ctx = { isSeller: false, currency: "TRY", statusLabel: "Onaylandı", labels, locale: "tr" };

describe("buildOrderPrintHtml — stored XSS escape", () => {
  it("kalem adındaki <img onerror> ÇALIŞMAZ (escape'lenir, metin olur)", () => {
    const html = buildOrderPrintHtml(
      {
        ...baseOrder,
        items: [
          { ...baseOrder.items[0], name: "<img src=x onerror=alert(1)>" },
        ],
      },
      ctx,
    );
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("counterparty/listingTitle'daki </script> ve <svg onload> enjeksiyonu escape'lenir", () => {
    const html = buildOrderPrintHtml(
      {
        ...baseOrder,
        counterparty: "</td></tr><script>alert(1)</script>",
        listingTitle: "<svg onload=alert(1)>",
      },
      ctx,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<svg onload=alert(1)>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;svg onload=alert(1)&gt;");
  });

  it("normal veri düzgün render (escape yalnız meta karakterleri etkiler)", () => {
    const html = buildOrderPrintHtml(baseOrder, ctx);
    expect(html).toContain("Boru");
    expect(html).toContain("Test Firma");
    expect(html).toContain("ORD-2026-0001");
    // CSP: üretilen HTML'de HİÇBİR inline <script> yok — yazdırmayı ebeveyn
    // tetikler (bkz. page.tsx handlePrint). strict script-src'i kırmaz.
    expect(html).not.toContain("<script");
  });
});

describe("buildOrderPrintHtml — para 2 ondalık (derin denetim LU-22)", () => {
  it("birim fiyat ve toplam her zaman kuruşlu; satır tutarı kuruşa yuvarlanır", () => {
    const html = buildOrderPrintHtml(
      {
        ...baseOrder,
        amount: 5,
        items: [{ name: "Boru", unit: "kg", quantity: 1.5, unitPrice: 3.33, deliveryDate: null }],
      },
      ctx,
    );
    expect(html).toContain("3,33 ₺");
    // 1,5 × 3,33 = 4,995 → 5,00 (ROUND_HALF_UP), "4,995" basılmaz.
    expect(html).not.toContain("4,995");
    expect(html).toContain("5,00 ₺");
  });

  it("tam sayı tutar da kuruşla basılır (1.000 ₺ değil 1.000,00 ₺)", () => {
    const html = buildOrderPrintHtml(baseOrder, ctx);
    expect(html).toContain("200,00 ₺");
    expect(html).toContain("1.000,00 ₺");
  });
});

describe("buildOrderPrintHtml — muadil kalem (arayüz testi O-003)", () => {
  it("muadil teklif edilen ve istenen marka/parça no çıktıda yazar (escape'li)", () => {
    const html = buildOrderPrintHtml(
      {
        ...baseOrder,
        items: [
          {
            ...baseOrder.items[0],
            name: "Rulman 6204",
            requestedBrand: "SKF",
            requestedMpn: "6204-2RS",
            isAlternative: true,
            offeredBrand: "FAG",
            offeredMpn: "6204-2Z-C3",
          },
        ],
      },
      ctx,
    );
    expect(html).toContain(
      "Muadil — Teklif edilen: FAG · 6204-2Z-C3 (İstenen: SKF · 6204-2RS)",
    );
  });

  it("muadil değilse istenen marka · parça no; ikisi de yoksa satır yok", () => {
    expect(itemBrandLine({ requestedBrand: "SKF", requestedMpn: "6204-2RS" }, labels)).toBe(
      "SKF · 6204-2RS",
    );
    expect(itemBrandLine({}, labels)).toBeNull();
    expect(itemBrandLine({ isAlternative: true }, labels)).toBe(
      "Muadil — Teklif edilen: belirtilmedi",
    );
  });
});

describe("buildOrderPrintHtml — iki taraf, adres, ödeme şartı, fatura no (arayüz testi D-111)", () => {
  it("alıcı okurken: kendi firması alıcı, karşı taraf satıcı; ek satırlar escape'li", () => {
    const html = buildOrderPrintHtml(
      { ...baseOrder, invoiceNumber: "FTR-<1>" },
      {
        ...ctx,
        ownCompanyName: "Alıcı A.Ş.",
        deliveryAddress: "Merkez Depo — Organize Sanayi 3. Cad., Ankara",
        paymentTerms: "Teslimden sonra 30 gün vadeli",
      },
    );
    expect(html).toContain("<strong>Alıcı:</strong> Alıcı A.Ş.");
    expect(html).toContain("<strong>Satıcı:</strong> Test Firma");
    expect(html).toContain("<strong>Ödeme şartı:</strong> Teslimden sonra 30 gün vadeli");
    expect(html).toContain("<strong>Fatura no:</strong> FTR-&lt;1&gt;");
    expect(html).toContain("<strong>Teslim adresi:</strong> Merkez Depo");
  });

  it("satıcı okurken taraflar yer değiştirir; boş alanların satırı basılmaz", () => {
    const html = buildOrderPrintHtml(baseOrder, { ...ctx, isSeller: true, ownCompanyName: "Satıcı Ltd." });
    expect(html).toContain("<strong>Alıcı:</strong> Test Firma");
    expect(html).toContain("<strong>Satıcı:</strong> Satıcı Ltd.");
    expect(html).not.toContain("Fatura no");
    expect(html).not.toContain("Teslim adresi");
    expect(html).not.toContain("Ödeme şartı");
  });
});
