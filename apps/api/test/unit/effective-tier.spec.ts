/**
 * effectiveTier — INV-TIER-1 tek kaynak. Süre-dolmuş PAKET → STANDARD (lazy).
 */
import { effectiveTier } from "../../src/common/company/effective-tier";

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
