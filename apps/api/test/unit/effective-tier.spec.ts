/**
 * effectiveTier — INV-TIER-1 tek kaynak (Faz T: 4 kademe).
 * Süre-dolmuş paralı kademe (SILVER/GOLD) → STANDART (lazy).
 */
import {
  effectiveTier,
  tierAtLeastWhere,
  anyPackageWhere,
} from "../../src/common/company/effective-tier";
import { tierAtLeast } from "@rothern/shared";

const past = new Date(Date.now() - 1000);
const future = new Date(Date.now() + 100_000);

describe("effectiveTier", () => {
  it("paralı kademe + geçmiş bitiş → STANDART (süre doldu)", () => {
    expect(effectiveTier("GOLD", past)).toBe("STANDART");
    expect(effectiveTier("SILVER", past)).toBe("STANDART");
    expect(effectiveTier("SILVER", past)).toBe("STANDART");
  });
  it("paralı kademe + gelecek/null bitiş → kendisi (aktif/süresiz)", () => {
    expect(effectiveTier("GOLD", future)).toBe("GOLD");
    expect(effectiveTier("SILVER", null)).toBe("SILVER");
    expect(effectiveTier("SILVER", future)).toBe("SILVER");
  });
  it("STANDART her durumda → STANDART; bilinmeyen değer → STANDART (fail-closed)", () => {
    expect(effectiveTier("STANDART", past)).toBe("STANDART");
    expect(effectiveTier("STANDART", null)).toBe("STANDART");
    expect(effectiveTier("PAKET", null)).toBe("STANDART"); // eski/bilinmeyen literal
  });
});

describe("tierAtLeast (shared sıra — api+web tek kaynak)", () => {
  it("kademe sırası STANDART < SILVER < GOLD (üç paket)", () => {
    expect(tierAtLeast("GOLD", "SILVER")).toBe(true);
    expect(tierAtLeast("SILVER", "SILVER")).toBe(true);
    expect(tierAtLeast("SILVER", "GOLD")).toBe(false);
    expect(tierAtLeast("SILVER", "SILVER")).toBe(true);
    expect(tierAtLeast("STANDART", "SILVER")).toBe(false);
    expect(tierAtLeast("bilinmeyen", "SILVER")).toBe(false); // fail-closed
  });
});

describe("tierAtLeastWhere / anyPackageWhere (INV-TIER-1 DB-filter tek kaynağı)", () => {
  it("min=SILVER → tier ∈ {SILVER, GOLD} + süre koşulu AND'e sarılı", () => {
    const now = new Date();
    const w = tierAtLeastWhere("SILVER", now);
    expect(w.tier).toEqual({ in: ["SILVER", "GOLD"] });
    expect(w.AND).toEqual([
      { OR: [{ membershipEndAt: null }, { membershipEndAt: { gte: now } }] },
    ]);
  });
  it("anyPackageWhere = SILVER+ (dizin/keşfet/sitemap/duyuru filtresi)", () => {
    const now = new Date();
    expect(anyPackageWhere(now).tier).toEqual({
      in: ["SILVER", "GOLD"],
    });
  });
  it("sınır effectiveTier ile birebir: gte now (< now = expired)", () => {
    // effectiveTier'da membershipEndAt < now → STANDART; dolayısıyla where'de
    // dahil olması gereken sınır gte now. (Regresyon nöbetçisi: lt/lte'ye
    // kayarsa iki taraf ıraksar.)
    const now = new Date();
    const cond = tierAtLeastWhere("SILVER", now).AND[0].OR[1] as {
      membershipEndAt: { gte: Date };
    };
    expect(cond.membershipEndAt.gte).toBe(now);
  });
});
