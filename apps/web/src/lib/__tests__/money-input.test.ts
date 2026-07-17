import { describe, expect, it } from "vitest";
import { MAX_MONEY } from "@rothern/shared";
import { moneyInputError, maxDecimals } from "../money-input";

describe("moneyInputError (F4: backend DTO birebir)", () => {
  it("min 0.01 altı reddedilir", () => {
    expect(moneyInputError(0)).toBeTruthy();
    expect(moneyInputError(0.005)).toBeTruthy();
  });
  it("2 ondalıktan fazla reddedilir", () => {
    expect(moneyInputError(12.345)).toMatch(/ondalık/);
  });
  it("MAX_MONEY üstü reddedilir", () => {
    expect(moneyInputError(MAX_MONEY + 1)).toMatch(/çok büyük/);
  });
  it("geçerli tutar null döner", () => {
    expect(moneyInputError(0.01)).toBeNull();
    expect(moneyInputError(1500.5)).toBeNull();
  });
  it("özel min uygulanır (unitPrice >0)", () => {
    expect(moneyInputError(0.5, { min: 0.01 })).toBeNull();
  });
});

describe("maxDecimals", () => {
  it("basamak sınırı", () => {
    expect(maxDecimals(1.23, 2)).toBe(true);
    expect(maxDecimals(1.234, 2)).toBe(false);
    expect(maxDecimals(1.234, 3)).toBe(true);
    expect(maxDecimals(5, 2)).toBe(true);
  });
});
