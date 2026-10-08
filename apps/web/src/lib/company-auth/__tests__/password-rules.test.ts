import { describe, expect, it } from "vitest";
import {
  firstUnmetPasswordRule,
  passwordByteLength,
  PASSWORD_DIGIT_RE,
  PASSWORD_ERROR_KEY,
  PASSWORD_LOWER_RE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_RE,
  PASSWORD_UPPER_RE,
} from "../password-rules";

/**
 * Şifre kuralları — kayıt, davet kabulü, sıfırlama ve Ayarlar › Şifre'nin TEK
 * yardımcısı (arayüz testi 2026-10 signup-tr-10, login-4). API DTO'larıyla
 * aynı desenler: küçük `\p{Ll}`, büyük `\p{Lu}`, rakam `[0-9]`, özel
 * `[^\p{L}\p{N}\s]`, en az 10 karakter, en çok 72 UTF-8 BAYT.
 */
describe("şifre kuralları Unicode bilir", () => {
  it("desenler API ile kararlaştırılan biçimde", () => {
    expect(PASSWORD_LOWER_RE.source).toBe("\\p{Ll}");
    expect(PASSWORD_UPPER_RE.source).toBe("\\p{Lu}");
    expect(PASSWORD_DIGIT_RE.source).toBe("[0-9]");
    expect(PASSWORD_SPECIAL_RE.source).toBe("[^\\p{L}\\p{N}\\s]");
    for (const re of [PASSWORD_LOWER_RE, PASSWORD_UPPER_RE, PASSWORD_SPECIAL_RE]) expect(re.flags).toContain("u");
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(72);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });

  it("Türkçe ve Kiril harfler büyük/küçük harf sayılır", () => {
    // Eskiden "Büyük harf yok" deniyordu (Ç ASCII değil).
    expect(firstUnmetPasswordRule("Çiçekler12!")).toBeNull();
    expect(firstUnmetPasswordRule("ŞİĞÜÖÇ-şığüöç1!")).toBeNull();
    // Eskiden "küçük harf yok" deniyordu.
    expect(firstUnmetPasswordRule("Пароль-Секрет1!")).toBeNull();
    for (const ch of "ÇĞİÖŞÜЖ") expect(PASSWORD_UPPER_RE.test(ch), ch).toBe(true);
    for (const ch of "çğıöşüж") expect(PASSWORD_LOWER_RE.test(ch), ch).toBe(true);
  });

  it("harf, rakam ve boşluk 'özel karakter' DEĞİLDİR", () => {
    // Eskiden "ş" özel karakter sayılıyor, simgesiz şifre kabul ediliyordu.
    expect(firstUnmetPasswordRule("Sifrem12345ş")).toBe("special");
    expect(firstUnmetPasswordRule("şifreŞİFRE12")).toBe("special");
    // On boşluk "özel karakter"i karşılıyordu.
    expect(PASSWORD_SPECIAL_RE.test("          ")).toBe(false);
    expect(PASSWORD_SPECIAL_RE.test("Aa1 Bb2\tCc3")).toBe(false);
    // Arap-Hint rakamı ne ASCII rakam ne özel karakter.
    expect(PASSWORD_SPECIAL_RE.test("٣")).toBe(false);
    expect(PASSWORD_DIGIT_RE.test("٣")).toBe(false);
    for (const ch of "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~€") expect(PASSWORD_SPECIAL_RE.test(ch), ch).toBe(true);
  });

  it("ilk karşılanmayan kural sabit sırayla döner (her form aynı iletiyi söyler)", () => {
    expect(firstUnmetPasswordRule("")).toBe("len");
    expect(firstUnmetPasswordRule("Parola12!")).toBe("len");
    expect(firstUnmetPasswordRule("BUYUKHARF1!")).toBe("lower");
    expect(firstUnmetPasswordRule("kucukharf1")).toBe("upper");
    expect(firstUnmetPasswordRule("GucluParola!")).toBe("digit");
    expect(firstUnmetPasswordRule("GucluParola12")).toBe("special");
    expect(firstUnmetPasswordRule("Guclu!Parola9")).toBeNull();
  });

  it("72 karakter kabul, 73 karakter `max`", () => {
    const base = "Aa1!";
    expect(firstUnmetPasswordRule(base + "x".repeat(68))).toBeNull();
    expect(firstUnmetPasswordRule(base + "x".repeat(69))).toBe("max");
  });

  // Kimlik sağlayıcı şifreyi 72 UTF-8 BAYTTA keser. Eski denetim karakter
  // sayıyordu: 40 Kiril harfli şifre (80 bayt) formdan geçip sunucuda
  // reddediliyordu.
  it("üst sınır BAYT sayar: ASCII dışı harf 2, emoji 4 bayt", () => {
    expect(passwordByteLength("Aa1!")).toBe(4);
    expect(passwordByteLength("ş")).toBe(2);
    expect(passwordByteLength("я")).toBe(2);
    expect(passwordByteLength("😀")).toBe(4);
    expect("😀".length).toBe(2); // UTF-16 birimi ≠ bayt

    const base = "Aa1!";
    // Kiril: 4 + 34×2 = 72 bayt (38 karakter) kabul; 39 karakter (74 bayt) ret.
    expect(firstUnmetPasswordRule(base + "я".repeat(34))).toBeNull();
    expect(firstUnmetPasswordRule(base + "я".repeat(35))).toBe("max");
    // Türkçe harf de 2 bayt.
    expect(firstUnmetPasswordRule(base + "ş".repeat(34))).toBeNull();
    expect(firstUnmetPasswordRule(base + "ş".repeat(35))).toBe("max");
    // 72 KARAKTER ama 73 bayt: alanın maxLength'i (72) bunu yakalayamaz.
    const seventyTwoChars = base + "x".repeat(67) + "ş";
    expect(seventyTwoChars).toHaveLength(72);
    expect(passwordByteLength(seventyTwoChars)).toBe(73);
    expect(firstUnmetPasswordRule(seventyTwoChars)).toBe("max");
    expect(firstUnmetPasswordRule(base + "x".repeat(66) + "ş")).toBeNull();
    // Emoji: 8 + 16×4 = 72 bayt kabul, 76 bayt ret.
    expect(firstUnmetPasswordRule("Aa1!xxxx" + "😀".repeat(16))).toBeNull();
    expect(firstUnmetPasswordRule("Aa1!xxxx" + "😀".repeat(17))).toBe("max");
  });

  it("`max` öteki kurallardan ÖNCE söylenir (çok uzun ve eksik kurallı şifrede tek ileti)", () => {
    expect(firstUnmetPasswordRule("я".repeat(40))).toBe("max");
  });

  it("72 baytı aşmayan şifre alanın maxLength'ini (72 karakter) de aşamaz", () => {
    // maxLength geçerli hiçbir şifreyi kesmez: bayt ≥ karakter.
    for (const pw of ["Aa1!" + "x".repeat(68), "Aa1!" + "я".repeat(34), "Aa1!xxxx" + "😀".repeat(16)]) {
      expect(passwordByteLength(pw)).toBeLessThanOrEqual(PASSWORD_MAX_BYTES);
      expect(pw.length).toBeLessThanOrEqual(PASSWORD_MAX_LENGTH);
    }
  });

  it("her sonuç bir `web.auth.password.*` ileti anahtarına eşlenir", () => {
    expect(PASSWORD_ERROR_KEY).toEqual({
      len: "min",
      max: "max",
      lower: "lower",
      upper: "upper",
      digit: "digit",
      special: "special",
    });
  });
});
