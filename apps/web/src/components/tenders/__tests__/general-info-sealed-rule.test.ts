/**
 * Talep detayı "Kapalı zarf" kural çipi (T-16): formata göre çizilir, kayıtlı
 * bayrağa yalnız format yoksa bakılır.
 */
import { describe, expect, it } from "vitest";
import { sealedRuleActive } from "../general-info-tab";

describe("sealedRuleActive", () => {
  it("RFQ her zaman kapalı zarf — eski turdaki false bayrağı çipi söndürmez", () => {
    expect(sealedRuleActive({ format: "RFQ", isSealedBid: false })).toBe(true);
    expect(sealedRuleActive({ format: "RFQ", isSealedBid: true })).toBe(true);
  });

  it("açık eksiltme hiçbir zaman kapalı zarf değil — kayıtlı true bayrağı yok sayılır", () => {
    expect(sealedRuleActive({ format: "ENGLISH_AUCTION", isSealedBid: true })).toBe(false);
  });

  it("format yoksa kayıtlı bayrak kullanılır", () => {
    expect(sealedRuleActive({ format: null, isSealedBid: true })).toBe(true);
    expect(sealedRuleActive({ format: null, isSealedBid: false })).toBe(false);
    expect(sealedRuleActive({ format: null })).toBe(false);
  });
});
