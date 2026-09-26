import { describe, it, expect } from "vitest";
import { orderFullyPaid, isAdvanceMet } from "../payment-status";

describe("orderFullyPaid (F1: INV-MONEY-1, epsilon YOK)", () => {
  it("1 kuruş eksikte tam-ödeme DEĞİL (eski epsilon açıyordu)", () => {
    // total 100.00, confirmed 99.99 → backend remaining = 0.01 > 0.
    expect(orderFullyPaid({ remaining: "0.01" }, "100.00")).toBe(false);
  });
  it("tam ödemede tam-ödeme (remaining 0)", () => {
    expect(orderFullyPaid({ remaining: "0.00" }, "100.00")).toBe(true);
  });
  it("fazla/yuvarlanmış remaining (max 0) → tam", () => {
    expect(orderFullyPaid({ remaining: "0" }, "100.00")).toBe(true);
  });
  it("paymentTotals yoksa güvenli varsayılan: ödenmemiş (kalan = tutar)", () => {
    expect(orderFullyPaid(null, "100.00")).toBe(false);
    expect(orderFullyPaid(undefined, "0")).toBe(true); // 0 tutarlı sipariş edge
  });
});

describe("isAdvanceMet (F1: epsilon YOK, exact >=)", () => {
  it("peşin şartı yok (advanceDue 0) → karşılandı", () => {
    expect(isAdvanceMet("0.00", "0")).toBe(true);
  });
  it("1 kuruş eksik peşin → karşılanmaDI", () => {
    expect(isAdvanceMet("50.00", "49.99")).toBe(false);
  });
  it("tam/fazla peşin → karşılandı", () => {
    expect(isAdvanceMet("50.00", "50.00")).toBe(true);
    expect(isAdvanceMet("50.00", "60.00")).toBe(true);
  });
});
