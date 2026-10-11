import { describe, expect, it } from "vitest";
import { normalizeOtpCode } from "../otp-code";
import { strengthLevel } from "../password-rules";

describe("normalizeOtpCode (arayüz testi D-351)", () => {
  it("önce rakam dışını ayıklar, sonra 6'ya keser", () => {
    expect(normalizeOtpCode("12ab34cd5678")).toBe("123456");
    expect(normalizeOtpCode("123 456")).toBe("123456");
    expect(normalizeOtpCode("Kod: 123456")).toBe("123456");
    expect(normalizeOtpCode("12")).toBe("12");
  });
});

describe("strengthLevel (arayüz testi D-087)", () => {
  it("zorunlu kural eksikken etiket 'Orta'yı (2) aşmaz", () => {
    expect(strengthLevel(4)).toBe(2);
    expect(strengthLevel(3)).toBe(2);
    expect(strengthLevel(1)).toBe(1);
    expect(strengthLevel(0)).toBe(0);
  });
  it("tüm kurallar sağlanınca en üst kademe", () => {
    expect(strengthLevel(5)).toBe(5);
  });
});
