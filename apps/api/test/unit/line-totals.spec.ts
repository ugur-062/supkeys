/**
 * S5 — kalem satır toplamı tek-kaynak (lineTotal / sumLineTotals).
 * placeBid bid.amount + buildItemGroups grup tutarı + runFullAward nöbetçisi
 * aynı `Σ(unitPrice × quantity)` magnitude'unu kullanır.
 */
import { lineTotal, sumLineTotals } from "../../src/common/company/bid-items";

describe("S5 — line totals", () => {
  it("lineTotal = unitPrice × quantity (Decimal)", () => {
    expect(lineTotal("1234.56", 3).toString()).toBe("3703.68");
    expect(lineTotal(100, 0).toString()).toBe("0");
  });

  it("sumLineTotals = Σ(unitPrice × quantity)", () => {
    expect(
      sumLineTotals([
        { unitPrice: "100.00", quantity: 2 },
        { unitPrice: "50.25", quantity: 4 },
      ]).toString(),
    ).toBe("401"); // 200 + 201
  });

  it("boş dizi → 0", () => {
    expect(sumLineTotals([]).toString()).toBe("0");
  });
});
