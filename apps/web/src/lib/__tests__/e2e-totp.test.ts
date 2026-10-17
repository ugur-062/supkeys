import { describe, expect, it } from "vitest";
import { base32Decode, hotp, totp } from "../../../e2e/totp";

/**
 * E2E admin 2FA yardımcısı (e2e/totp.ts) — API `otplib` ile aynı kodu
 * üretmeli; yoksa staging/canlı admin girişi 401 "Doğrulama kodu hatalı" alır.
 * Vektörler RFC 4226 Ek D ve RFC 6238 Ek B (SHA-1).
 */
describe("e2e totp yardımcısı", () => {
  const rfcKey = Buffer.from("12345678901234567890", "ascii");

  it("RFC 4226 HOTP vektörleri", () => {
    const beklenen = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    beklenen.forEach((kod, i) => expect(hotp(rfcKey, i)).toBe(kod));
  });

  it("RFC 6238 TOTP vektörleri (8 hane, SHA-1)", () => {
    // Aynı anahtarın base32 hâli.
    const rfcB32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(base32Decode(rfcB32).equals(rfcKey)).toBe(true);
    expect(totp(rfcB32, 59_000, 30, 8)).toBe("94287082");
    expect(totp(rfcB32, 1_111_111_109_000, 30, 8)).toBe("07081804");
    expect(totp(rfcB32, 1_234_567_890_000, 30, 8)).toBe("89005924");
    expect(totp(rfcB32, 20_000_000_000_000, 30, 8)).toBe("65353130");
  });

  it("otplib authenticator ile aynı 6 haneli kod (küçük harf/boşluk toleransı)", () => {
    // `authenticator.generate` ile üretildi (otplib 12, apps/api).
    expect(totp("JBSWY3DPEHPK3PXP", 1_700_000_000_000)).toBe("324550");
    expect(totp("jbsw y3dp ehpk 3pxp", 1_700_000_000_000)).toBe("324550");
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1_234_567_890_000)).toBe("005924");
  });

  it("geçersiz base32 karakteri açık hata verir", () => {
    expect(() => base32Decode("ABC1")).toThrow(/base32/);
  });
});
