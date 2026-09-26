import {
  bankAccountRef,
  bankDetailsErrors,
  isValidSwiftBic,
  parsePhone,
  composePhone,
} from "@rothern/shared";

/**
 * Banka kuralı + telefon ayrıştırıcı (2026-09-27, kayıt tüm ülkelere açıldı).
 * Kural tek kaynak `bankDetailsErrors`: doğrulama, Banka Hesapları, profil ve
 * admin aynı fonksiyondan geçer (web formları da).
 */
describe("banka bilgisi kuralı", () => {
  it("IBAN ülkesi: IBAN zorunlu ve mod-97; SWIFT isteğe bağlı (defter) / zorunlu (doğrulama)", () => {
    expect(bankDetailsErrors({ country: "DE" })).toEqual(["ibanRequired"]);
    expect(bankDetailsErrors({ country: "DE", iban: "DE00370400440532013000" })).toEqual(["ibanInvalid"]);
    expect(bankDetailsErrors({ country: "DE", iban: "DE89 3704 0044 0532 0130 00" })).toEqual([]);
    expect(bankDetailsErrors({ country: "DE", iban: "DE89370400440532013000" }, { requireSwift: true })).toEqual(["swiftRequired"]);
    expect(bankDetailsErrors({ country: "TR", iban: "TR330006100519786457841326", swiftBic: "tgbatris" }, { requireSwift: true })).toEqual([]);
  });

  it("IBAN'sız ülke: hesap no + SWIFT + banka adı; geçerli IBAN da kabul", () => {
    expect(bankDetailsErrors({ country: "IN" }).sort()).toEqual(["accountNumberRequired", "bankNameRequired", "swiftRequired"].sort());
    expect(bankDetailsErrors({ country: "IN", accountNumber: "50100123456789", swiftBic: "HDFCINBB", bankName: "HDFC Bank" })).toEqual([]);
    expect(bankDetailsErrors({ country: "IN", accountNumber: "abc", swiftBic: "HDFC", bankName: "X" }).sort()).toEqual(["accountNumberInvalid", "swiftInvalid"].sort());
    expect(bankDetailsErrors({ country: "CN", iban: "DE89370400440532013000" })).toEqual([]);
  });

  it("SWIFT/BIC biçimi: 8/11 karakter ve geçerli ülke kodu", () => {
    expect(isValidSwiftBic("DEUTDEFF")).toBe(true);
    expect(isValidSwiftBic("DEUTDEFF500")).toBe(true);
    expect(isValidSwiftBic("deut de ff")).toBe(true);
    expect(isValidSwiftBic("DEUTZZFF")).toBe(false); // ZZ ülke değil
    expect(isValidSwiftBic("DEUT")).toBe(false);
  });

  it("görünen hesap kimliği", () => {
    expect(bankAccountRef({ iban: "tr33 0006" })).toBe("TR330006");
    expect(bankAccountRef({ accountNumber: "123456", swiftBic: "hdfcinbb" })).toBe("123456 · SWIFT HDFCINBB");
  });
});

describe("telefon ayrıştırıcı", () => {
  it("ortak kodda birincil ülke: +7 → Rusya (eskiden Kazakistan), +1 → ABD", () => {
    expect(parsePhone("+7 495 1234567").code).toBe("RU");
    expect(parsePhone("+1 212 5550100").code).toBe("US");
  });
  it("ulusal önek ülkeyi ayırır: +7 7xx → Kazakistan, +90 392 → KKTC", () => {
    expect(parsePhone("+7 7012345678").code).toBe("KZ");
    expect(parsePhone("+90 3921234567").code).toBe("XN");
    expect(parsePhone("+90 5321234567").code).toBe("TR");
  });
  it("NANP ada kodları ve yeni ülkeler tanınır", () => {
    expect(parsePhone("+1268 4601234").code).toBe("AG");
    expect(parsePhone("+94 771234567").code).toBe("LK");
    expect(composePhone("LK", "771234567")).toBe("+94 771234567");
  });
});
