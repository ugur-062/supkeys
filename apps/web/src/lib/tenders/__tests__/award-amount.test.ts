import { describe, expect, it } from "vitest";
import { itemAwardGroups } from "../award-amount";

const sel = (quantity: number, unitPrice: number, over: Record<string, string> = {}) => ({
  quantity,
  unitPrice,
  currency: "TRY",
  bidId: "b1",
  bidderName: "Tedarik A",
  ...over,
});

describe("itemAwardGroups — sunucunun sipariş tutarıyla aynı yuvarlama", () => {
  it("kesirli miktarda grup toplamı BİR KEZ yuvarlanır (1,5 × 3,33 iki kez → 9,99; satır satır 10,00 olurdu)", () => {
    expect(itemAwardGroups([sel(1.5, 3.33), sel(1.5, 3.33)])).toEqual([
      { bidId: "b1", bidderName: "Tedarik A", currency: "TRY", amount: 9.99 },
    ]);
  });

  it("tek satırda yarım kuruş yukarı yuvarlanır (roundMoney ROUND_HALF_UP)", () => {
    expect(itemAwardGroups([sel(1.5, 3.33)])[0]!.amount).toBe(5);
  });

  it("firma + birim başına ayrı grup; birimler toplanmaz", () => {
    const groups = itemAwardGroups([
      sel(1.5, 3.33),
      sel(1.5, 3.33, { currency: "USD" }),
      sel(2, 10, { bidId: "b2", bidderName: "Tedarik B" }),
    ]);
    expect(groups.map((g) => [g.bidId, g.currency, g.amount])).toEqual([
      ["b1", "TRY", 5],
      ["b1", "USD", 5],
      ["b2", "TRY", 20],
    ]);
  });
});
