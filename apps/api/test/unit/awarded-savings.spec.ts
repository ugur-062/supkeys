import {
  awardedBidForItem,
  awardedSavingsVolumeTry,
} from "../../src/common/company/report-currency";

/**
 * Derin denetim 2026-09-29 (MU-18 gözden geçirme): kalem-bazlı kazandırmada
 * kalemin FİİLEN verildiği teklifin fiyatı kullanılır — kazananlar arasındaki
 * en düşük fiyat DEĞİL (kalem en ucuz olmayan kazanana verildiğinde tasarruf
 * fazla çıkıyordu).
 */
describe("awardedBidForItem / awardedSavingsVolumeTry", () => {
  const tryBid = (
    bidderCompanyId: string,
    status: string,
    prices: Record<string, number>,
  ) => ({
    bidderCompanyId,
    status,
    currency: "TRY",
    exchangeRateSnapshot: null,
    items: Object.entries(prices).map(([itemId, unitPrice]) => ({ itemId, unitPrice })),
  });

  // X: A=90, B=50 (B'yi kazandı). Y: A=95 (A'yı kazandı). A hedefi 100.
  const X = tryBid("co-x", "AWARDED_PARTIAL", { A: 90, B: 50 });
  const Y = tryBid("co-y", "WON", { A: 95 });
  const listing = {
    primaryCurrency: "TRY",
    items: [
      { id: "A", name: "Rulman", quantity: 10, targetPrice: 100, awardedQuantity: 10 },
      { id: "B", name: "Conta", quantity: 2, targetPrice: 60, awardedQuantity: null },
    ],
    bids: [X, Y],
    orders: [
      { sellerCompanyId: "co-x", items: [{ name: "Conta", unitPrice: "50.00" }] },
      { sellerCompanyId: "co-y", items: [{ name: "Rulman", unitPrice: "95.00" }] },
    ],
  };

  it("kalem en ucuz olmayan kazanana verildiyse o teklifin fiyatını alır", () => {
    const win = awardedBidForItem(listing.items[0]!, listing.bids, listing.orders);
    expect(win?.bid.bidderCompanyId).toBe("co-y");
    expect(win?.unitPriceTry).toBe(95);
    // A: (100-95)*10 = 50; B: (60-50)*2 = 20 — eskiden A 90'dan: 100+20=120.
    expect(awardedSavingsVolumeTry(listing)).toEqual({ savings: 70, volume: 1050 });
  });

  it("tek kazanan fiyatlamışsa sipariş gerekmez", () => {
    const win = awardedBidForItem(listing.items[1]!, listing.bids, null);
    expect(win?.bid.bidderCompanyId).toBe("co-x");
    expect(win?.unitPriceTry).toBe(50);
  });

  it("sipariş yoksa/eşleşmezse en az tasarruflu (en yüksek) fiyat — uydurma tasarruf yok", () => {
    const noOrders = { ...listing, orders: undefined };
    expect(awardedSavingsVolumeTry(noOrders)).toEqual({ savings: 70, volume: 1050 });
    const mismatched = {
      ...listing,
      orders: [{ sellerCompanyId: "co-z", items: [{ name: "Rulman", unitPrice: 90 }] }],
    };
    expect(awardedBidForItem(mismatched.items[0]!, mismatched.bids, mismatched.orders)?.unitPriceTry).toBe(95);
  });

  it("fiilen kazanan damgasızsa kalem hesaba katılmaz (başka teklife düşülmez)", () => {
    const eurY = { ...Y, currency: "EUR", items: [{ itemId: "A", unitPrice: 3 }] };
    const win = awardedBidForItem(listing.items[0]!, [X, eurY], [
      { sellerCompanyId: "co-y", items: [{ name: "Rulman", unitPrice: 3 }] },
    ]);
    expect(win).toBeNull();
  });
});
