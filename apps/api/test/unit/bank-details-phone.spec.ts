import {
  bankAccountRef,
  bankDetailsErrors,
  classifyBankAccountInput,
  countryIbanMode,
  ibanLengthForPrefix,
  ibanPlaceholder,
  isValidIbanAny,
  isValidSwiftBic,
  parsePhone,
  composePhone,
  parseInternationalInput,
  stripTrunkPrefix,
  isValidPhoneNumber,
  normalizeDigits,
  phoneNationalLength,
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
    // Tek alanlı formlar (doğrulama, admin) IBAN'ı hesap no alanında gönderir.
    expect(bankDetailsErrors({ country: "IN", accountNumber: "DE89 3704 0044 0532 0130 00" })).toEqual([]);
  });

  it("kısmi IBAN ülkesi (BR, EG…): IBAN YA DA hesap no + SWIFT + banka adı", () => {
    expect(countryIbanMode("BR")).toBe("optional");
    expect(countryIbanMode("RU")).toBe("optional"); // kayıtta var, profil IBAN'sız
    expect(countryIbanMode("DE")).toBe("required");
    expect(countryIbanMode("IN")).toBe("none");
    // Yerel hesap (agência/conta) + SWIFT + banka adı yeter.
    expect(
      bankDetailsErrors({ country: "BR", accountNumber: "0001 12345-6", swiftBic: "BRASBRRJ", bankName: "Banco do Brasil" }),
    ).toEqual([]);
    expect(bankDetailsErrors({ country: "BR" }).sort()).toEqual(
      ["accountNumberRequired", "bankNameRequired", "swiftRequired"].sort(),
    );
    // Geçerli Brezilya IBAN'ı (29) da kabul — SWIFT/banka adı istenmez.
    expect(bankDetailsErrors({ country: "BR", iban: "BR1800360305000010009795493C1" })).toEqual([]);
    expect(bankDetailsErrors({ country: "BR", accountNumber: "BR18 0036 0305 0000 1000 9795 493C 1" })).toEqual([]);
    // Doğrulamada SWIFT her ülkede zorunlu kalır.
    expect(bankDetailsErrors({ country: "BR", iban: "BR1800360305000010009795493C1" }, { requireSwift: true })).toEqual([
      "swiftRequired",
    ]);
  });

  it("IBAN uzunluğu ülke önekinin kayıtlı uzunluğuyla denetlenir (TR katı)", () => {
    expect(isValidIbanAny("DE89370400440532013000")).toBe(true);
    // Mod-97'yi tutan ama DE için bir hane eksik/fazla IBAN reddedilir.
    expect(isValidIbanAny("DE8937040044053201300")).toBe(false);
    expect(isValidIbanAny("DE893704004405320130000")).toBe(false);
    expect(isValidIbanAny("TR330006100519786457841326")).toBe(true);
    expect(isValidIbanAny("TR33000610051978645784132")).toBe(false);
    expect(bankDetailsErrors({ country: "DE", iban: "DE8937040044053201300" })).toEqual(["ibanInvalid"]);
    // Kayıtta olmayan önek: yalnız mod-97 (deneysel IBAN ülkeleri).
    expect(ibanLengthForPrefix("ZZ")).toBeNull();
  });

  it("yaptırım ülkesi: IBAN öneki ve SWIFT ülkesi REGISTRATION_BLOCKED'a karşı denetlenir (derin denetim MU-17)", () => {
    const IR_IBAN = "IR270170000000100324200001"; // mod-97 tutar, IR kayıtlı uzunluk tablosunda yok
    expect(bankDetailsErrors({ country: "DE", iban: IR_IBAN })).toEqual(["ibanCountryBlocked"]);
    expect(bankDetailsErrors({ country: "AE", iban: IR_IBAN })).toEqual(["ibanCountryBlocked"]);
    // IBAN'sız ülke: hesap no alanına yazılmış IR IBAN'ı ve İran SWIFT'i.
    expect(bankDetailsErrors({ country: "JP", accountNumber: IR_IBAN })).toEqual(["ibanCountryBlocked"]);
    expect(
      bankDetailsErrors({ country: "JP", accountNumber: "1234567", swiftBic: "MELIIRTH", bankName: "Melli" }),
    ).toEqual(["swiftCountryBlocked"]);
    expect(bankDetailsErrors({ country: "TR", iban: "TR330006100519786457841326", swiftBic: "BPPRPRSJ" })).toEqual([
      "swiftCountryBlocked",
    ]);
    // Açık ülkeler etkilenmez.
    expect(bankDetailsErrors({ country: "JP", accountNumber: "1234567", swiftBic: "MUFGJPJT", bankName: "MUFG" })).toEqual([]);
    // Önek geçerli bir ülke kodu değilse mod-97 tutsa da IBAN değil.
    expect(isValidIbanAny("XX0912345678901234567890")).toBe(false);
    expect(isValidIbanAny("XK051212012345678906")).toBe(true);
  });

  it("IBAN yer tutucusu ülke önekiyle ve kayıtlı uzunlukta", () => {
    expect(ibanPlaceholder("TR")).toBe("TR00 0000 0000 0000 0000 0000 00");
    expect(ibanPlaceholder("DE")).toBe("DE00 0000 0000 0000 0000 00");
    expect(ibanPlaceholder("RE")).toMatch(/^FR00 /); // Fransız toprağı FR IBAN'ı kullanır
    expect(ibanPlaceholder("IN")).toBeNull();
  });

  it("tek alana yazılan hesap kimliği: IBAN ülkesinde IBAN, değilse geçerli IBAN ya da hesap no", () => {
    expect(classifyBankAccountInput("DE", "de89 3704 0044 0532 0130 00")).toEqual({ iban: "DE89370400440532013000", accountNumber: null });
    expect(classifyBankAccountInput("BR", "0001 12345-6")).toEqual({ iban: null, accountNumber: "0001 12345-6" });
    expect(classifyBankAccountInput("BR", "BR1800360305000010009795493C1")).toEqual({
      iban: "BR1800360305000010009795493C1",
      accountNumber: null,
    });
    expect(classifyBankAccountInput("IN", " ")).toEqual({ iban: null, accountNumber: null });
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
  it("ortak kodda birincil ülke: +7 → Rusya (eskiden Kazakistan), +1 → Kanada (ABD kayda kapalı)", () => {
    expect(parsePhone("+7 495 1234567").code).toBe("RU");
    expect(parsePhone("+1 212 5550100").code).toBe("CA");
  });
  it("ortak kodda seçili ülke korunur; ulusal önek kuralı yine önce", () => {
    expect(parsePhone("+1 212 5550100", "US").code).toBe("US");
    expect(parsePhone("+44 1534 123456", "JE").code).toBe("JE");
    expect(parsePhone("+44 1534 123456", "DE").code).toBe("GB");
    expect(parsePhone("+7 7012345678", "RU").code).toBe("KZ");
  });
  it("ulusal önek '0' atılır (İtalya hariç); tam numara girişi ayrıştırılır", () => {
    expect(stripTrunkPrefix("TR", "05321234567")).toBe("5321234567");
    expect(stripTrunkPrefix("GB", "07911123456")).toBe("7911123456");
    expect(stripTrunkPrefix("IT", "0612345678")).toBe("0612345678");
    expect(stripTrunkPrefix("TR", "0")).toBe("0");
    expect(stripTrunkPrefix("TR", "00")).toBe("00");
    expect(parseInternationalInput("+44 07911 123456", "TR")).toEqual({ code: "GB", national: "7911123456" });
    expect(parseInternationalInput("0049 30 1234567", "TR")).toEqual({ code: "DE", national: "301234567" });
    expect(parseInternationalInput("+3", "TR")).toEqual({ pending: true });
    expect(parseInternationalInput("5321234567", "TR")).toBeNull();
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
  it("ulusal önek '8' (RU/KZ/BY): yalnız tam uzunluğun bir fazlasında düşer", () => {
    expect(stripTrunkPrefix("RU", "8 916 123-45-67")).toBe("9161234567");
    // 812 St. Petersburg: 10 haneli numara "8" ile BAŞLAYABİLİR → dokunulmaz.
    expect(stripTrunkPrefix("RU", "8121234567")).toBe("8121234567");
    expect(stripTrunkPrefix("RU", "8 812 123 45 67")).toBe("8121234567");
    expect(stripTrunkPrefix("RU", "8")).toBe("8"); // yazılmaya yeni başlandı
    expect(stripTrunkPrefix("KZ", "8 701 123 45 67")).toBe("7011234567");
    expect(stripTrunkPrefix("BY", "8 029 123 45 67")).toBe("291234567");
    // "+7 8 701 …": önek düşünce ülke yeniden belirlenir (Kazakistan).
    expect(parseInternationalInput("+7 8 701 123 45 67", "RU")).toEqual({ code: "KZ", national: "7011234567" });
  });
  it("Macaristan ulusal öneki '06' üçüncü hanede düşer", () => {
    expect(stripTrunkPrefix("HU", "06 30 123 4567")).toBe("301234567");
    expect(stripTrunkPrefix("HU", "06")).toBe("06");
    expect(stripTrunkPrefix("HU", "063")).toBe("3");
  });
  it("Arap-Hint/Farsça rakamlar sessizce düşmez", () => {
    expect(normalizeDigits("٠٥٣٢ ۱۲۳")).toBe("0532 123");
    expect(stripTrunkPrefix("TR", "٠٥٣٢١٢٣٤٥٦٧")).toBe("5321234567");
    expect(composePhone("EG", "١٠٠١٢٣٤٥٦٧")).toBe("+20 1001234567");
    expect(isValidPhoneNumber("+٢٠ ١٠٠ ١٢٣ ٤٥٦٧")).toBe(true);
  });
  it("uzunluk ülkeye göre: TR tam 10; kısa geçerli numaralar (AD, LU, FO, GL, SB) kabul", () => {
    expect(isValidPhoneNumber("+90 5321234567")).toBe(true);
    expect(isValidPhoneNumber("+90 89161234567")).toBe(false); // bayrak değişmemiş Rus numarası
    expect(isValidPhoneNumber("+90 532123456")).toBe(false);
    expect(isValidPhoneNumber("+7 9161234567")).toBe(true);
    expect(isValidPhoneNumber("+7 89161234567")).toBe(false);
    expect(isValidPhoneNumber("+376 312345")).toBe(true);
    expect(isValidPhoneNumber("+352 4711")).toBe(true);
    expect(isValidPhoneNumber("+298 123456")).toBe(true);
    expect(isValidPhoneNumber("+299 123456")).toBe(true);
    expect(isValidPhoneNumber("+677 12345")).toBe(true);
    expect(isValidPhoneNumber("+39 0612345678")).toBe(true); // İtalya'da 0 numaranın parçası
    expect(isValidPhoneNumber("+1268 4601234")).toBe(true); // NANP ada: 7 hane
    expect(isValidPhoneNumber("+1 2125550100")).toBe(true);
    // "+"sız eski kayıt Türkiye numarası sayılır (ulusal önek atılarak).
    expect(isValidPhoneNumber("0532 123 45 67")).toBe(true);
    expect(isValidPhoneNumber("0049 30 1234567")).toBe(true);
    expect(isValidPhoneNumber("")).toBe(false);
    expect(isValidPhoneNumber("+90 532 abc")).toBe(false);
    // Tabloda olmayan ülke: 6 hane – E.164 tavanı (15 − ülke kodu); NANP ada 7.
    expect(phoneNationalLength("IO")).toEqual({ min: 6, max: 12 });
    expect(phoneNationalLength("KY")).toEqual({ min: 7, max: 7 });
    expect(phoneNationalLength("TR")).toEqual({ min: 10, max: 10 });
  });
});
