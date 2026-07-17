/**
 * effectiveTier — INV-TIER-1 tek kaynak. Süre-dolmuş PAKET → STANDARD (lazy).
 */
import {
  effectiveTier,
  effectivePaidWhere,
} from "../../src/common/company/effective-tier";

const past = new Date(Date.now() - 1000);
const future = new Date(Date.now() + 100_000);

describe("effectiveTier", () => {
  it("PAKET + geçmiş bitiş → STANDARD (süre doldu)", () => {
    expect(effectiveTier("PAKET", past)).toBe("STANDARD");
  });
  it("PAKET + gelecek bitiş → PAKET (aktif)", () => {
    expect(effectiveTier("PAKET", future)).toBe("PAKET");
  });
  it("PAKET + null bitiş → PAKET (süresiz)", () => {
    expect(effectiveTier("PAKET", null)).toBe("PAKET");
  });
  it("STANDARD her durumda → STANDARD", () => {
    expect(effectiveTier("STANDARD", past)).toBe("STANDARD");
    expect(effectiveTier("STANDARD", future)).toBe("STANDARD");
    expect(effectiveTier("STANDARD", null)).toBe("STANDARD");
  });
});

describe("effectivePaidWhere (INV-TIER-1 DB-filter tek kaynağı)", () => {
  it("tier PAKET + (membershipEndAt null VEYA gelecekte) fragment üretir", () => {
    const now = new Date();
    const w = effectivePaidWhere(now);
    expect(w.tier).toBe("PAKET");
    // OR, sibling top-level OR ile çakışmasın diye AND'e sarılı.
    expect(w.AND).toEqual([
      { OR: [{ membershipEndAt: null }, { membershipEndAt: { gte: now } }] },
    ]);
  });
  it("sınır effectiveTier ile birebir: gte now (< now = expired)", () => {
    // effectiveTier'da membershipEndAt < now → STANDARD; dolayısıyla where'de
    // dahil olması gereken sınır gte now. (Regresyon nöbetçisi: lt/lte'ye
    // kayarsa iki taraf ıraksar.)
    const now = new Date();
    const cond = effectivePaidWhere(now).AND[0].OR[1] as {
      membershipEndAt: { gte: Date };
    };
    expect(cond.membershipEndAt.gte).toBe(now);
  });
});
