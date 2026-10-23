import { describe, expect, it } from "vitest";

import { lineAmount } from "../line-amount";

describe("lineAmount", () => {
  it("kuruşa ROUND_HALF_UP (float çarpım hatası yuvarlamayı kaydırmaz)", () => {
    expect(lineAmount(1.5, 3.33)).toBe(5);
    expect(lineAmount(1.5, 10.33)).toBe(15.5);
    expect(lineAmount(0.001, 5)).toBe(0.01);
    expect(lineAmount(5, 200)).toBe(1000);
    expect(lineAmount(2.345, 1.01)).toBe(2.37);
  });
});
