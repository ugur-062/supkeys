import { describe, expect, it } from "vitest";

import { buildOrderPrintHtml } from "../order-print";

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
const ctx = { isSeller: false, curSym: "₺", statusLabel: "Onaylandı" };

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
