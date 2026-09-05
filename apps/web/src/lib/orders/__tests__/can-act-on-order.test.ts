import { describe, expect, it } from "vitest";
import { canActOnOrder } from "../can-act-on-order";

const u = (roles: string[], permissions?: string[]) => ({ roles, permissions });

describe("canActOnOrder (assertOrderRole aynası — izin tabanlı)", () => {
  it("satıcı yanı sell:order:manage; alıcı yanı buy:order:manage (rol hazır setinden)", () => {
    expect(canActOnOrder("seller", u(["SATISCI"]))).toBe(true);
    expect(canActOnOrder("buyer", u(["SATIN_ALMACI"]))).toBe(true);
    // Yön uyuşmayan işlem rolü geçmez.
    expect(canActOnOrder("seller", u(["SATIN_ALMACI"]))).toBe(false);
    expect(canActOnOrder("buyer", u(["SATISCI"]))).toBe(false);
  });
  it("açık izin listesi rolden ÖNCE gelir (yetki tablosu tiki)", () => {
    expect(canActOnOrder("seller", u([], ["sell:order:manage"]))).toBe(true);
    expect(canActOnOrder("seller", u(["SATISCI"], ["sell:view"]))).toBe(false);
  });
  it("etiket-only personalar (SAHIP/YONETICI/ONAYLAYICI) ve rolsüz geçmez", () => {
    for (const side of ["seller", "buyer"] as const) {
      expect(canActOnOrder(side, u(["SAHIP"]))).toBe(false);
      expect(canActOnOrder(side, u(["YONETICI"]))).toBe(false);
      expect(canActOnOrder(side, u(["ONAYLAYICI"]))).toBe(false);
      expect(canActOnOrder(side, u([]))).toBe(false);
      expect(canActOnOrder(side, undefined)).toBe(false);
    }
  });
  it("kombo roller: doğru yön rolü varsa etiketler zarar vermez", () => {
    expect(canActOnOrder("seller", u(["SAHIP", "SATISCI"]))).toBe(true);
    expect(canActOnOrder("buyer", u(["YONETICI", "SATIN_ALMACI"]))).toBe(true);
  });
});
