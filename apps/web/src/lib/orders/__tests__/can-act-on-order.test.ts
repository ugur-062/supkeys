import { describe, expect, it } from "vitest";
import { canActOnOrder } from "../can-act-on-order";

describe("canActOnOrder (assertOrderRole aynası)", () => {
  it("satıcı yanı yalnız SATISCI; alıcı yanı yalnız SATIN_ALMACI", () => {
    expect(canActOnOrder("seller", ["SATISCI"])).toBe(true);
    expect(canActOnOrder("buyer", ["SATIN_ALMACI"])).toBe(true);
    // Yön uyuşmayan işlem rolü geçmez.
    expect(canActOnOrder("seller", ["SATIN_ALMACI"])).toBe(false);
    expect(canActOnOrder("buyer", ["SATISCI"])).toBe(false);
  });
  it("etiket-only personalar (SAHIP/YONETICI/ONAYLAYICI) ve rolsüz geçmez", () => {
    for (const side of ["seller", "buyer"] as const) {
      expect(canActOnOrder(side, ["SAHIP"])).toBe(false);
      expect(canActOnOrder(side, ["YONETICI"])).toBe(false);
      expect(canActOnOrder(side, ["ONAYLAYICI"])).toBe(false);
      expect(canActOnOrder(side, [])).toBe(false);
      expect(canActOnOrder(side, undefined)).toBe(false);
    }
  });
  it("kombo roller: doğru yön rolü varsa etiketler zarar vermez", () => {
    expect(canActOnOrder("seller", ["SAHIP", "SATISCI"])).toBe(true);
    expect(canActOnOrder("buyer", ["YONETICI", "SATIN_ALMACI"])).toBe(true);
  });
});
