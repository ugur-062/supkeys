import {
  COUNTRY_PROFILES,
  COUNTRIES,
  REGISTRATION_BLOCKED,
  countryFlag,
  countryHasIban,
  countryName,
  countryUsesIban,
  getCountryProfile,
  isValidCountryCode,
  isRegistrationOpen,
  registrationCountries,
  requiredDocsForCountry,
} from "@rothern/shared";

/**
 * Ülke kapısı + belge profili sözleşmesi.
 *
 * Karar (2026-09-27, kullanıcı: "tüm ülkeler kayıt olabilsin, Amerika hariç"):
 * kayıt KAPALI LİSTE dışındaki her ülkeye açık — ABD + toprakları ve
 * kapsamlı yaptırım ülkeleri (İran, Kuzey Kore, Suriye, Küba) kapalı.
 * (2026-09-01 – 09-27 arası yalnız sekiz ülke açıktı.)
 */
describe("Ülke profilleri", () => {
  it("kapalı liste: ABD + toprakları ve dört yaptırım ülkesi — başka hiçbiri", () => {
    const closed = COUNTRIES.map((c) => c.code).filter((c) => !isRegistrationOpen(c)).sort();
    expect(closed).toEqual(["AS", "CU", "GU", "IR", "KP", "MP", "PR", "SY", "US", "VI"].sort());
    expect([...REGISTRATION_BLOCKED].sort()).toEqual(closed);
  });

  it("eskiden kapalı AB/Afrika/Asya ülkeleri artık açık", () => {
    for (const c of ["DE", "FR", "IT", "CY", "NG", "ZA", "EG", "KE", "IN", "BR", "JP", "GB", "CA"]) {
      expect(isRegistrationOpen(c)).toBe(true);
    }
  });

  it("bilinmeyen/boş kod kapalı (kapı fail-closed)", () => {
    expect(isRegistrationOpen("ZZ")).toBe(false);
    expect(isRegistrationOpen("")).toBe(false);
    expect(isRegistrationOpen(null)).toBe(false);
  });

  it("kayıt listesi: TR başta, kapalılar YOK, her ülkenin görünen ADI var", () => {
    const list = registrationCountries();
    expect(list[0]!.code).toBe("TR");
    expect(list.some((c) => c.code === "US")).toBe(false);
    expect(list.length).toBeGreaterThan(220);
    for (const c of list) {
      expect(c.name).toBeTruthy();
      expect(c.name).not.toBe(c.code);
    }
  });

  it("tam ülke listesi: kodlar tekil, TR başta, KKTC (XN) ve Kosova (XK) dahil", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe("TR");
    expect(codes.length).toBeGreaterThanOrEqual(245);
    expect(countryName("XN")).toMatch(/Kıbrıs/);
    expect(isValidCountryCode("XK")).toBe(true);
    // KKTC ve Kosova ISO bayrağı yok — uydurma bayrak basılmaz.
    expect(countryFlag("XN")).toBeNull();
    expect(countryFlag("XK")).toBeNull();
    expect(countryFlag("DE")).toBe("🇩🇪");
  });

  it("profili olmayan ülke VARSAYILAN yabancı profil alır: 3 belge, IBAN kaydından banka biçimi, AB → VIES", () => {
    const de = getCountryProfile("DE")!;
    expect(de).toMatchObject({ code: "DE", group: "EU", viesSupported: true, usesIban: true, taxIdRule: "GENERIC" });
    expect(de.requiredDocs).toEqual(["tradeRegistry", "taxPlate", "idFront"]);
    expect(getCountryProfile("IN")).toMatchObject({ group: "OTHER", viesSupported: false, usesIban: false });
    expect(getCountryProfile("NG")!.group).toBe("AFRICA");
    expect(getCountryProfile("ZZ")).toBeNull();
  });

  it("IBAN kullanımı: kayıt listesi + profil ezmesi (RU/UZ/CN hayır; FR toprakları ve KKTC evet)", () => {
    for (const c of ["TR", "DE", "GB", "AE", "SA", "BR", "XN", "RE", "GP"]) expect(countryUsesIban(c)).toBe(true);
    for (const c of ["RU", "UZ", "CN", "IN", "JP", "CA", "AU", "MX", "US"]) expect(countryUsesIban(c)).toBe(false);
    expect(countryHasIban("RU")).toBe(true); // kayıtta var ama profil ezer
  });

  describe("belge kümeleri ülkeye göre AYRIŞIYOR", () => {
    it("TR 6 belge (mevcut akış değişmedi)", () => {
      expect(requiredDocsForCountry("TR")).toHaveLength(6);
    });

    it("Çin TEK ruhsat + kimlik (营业执照 sicil+vergi+temsilci taşır)", () => {
      const cn = requiredDocsForCountry("CN");
      expect(cn).toEqual(["tradeRegistry", "idFront"]);
      // Ayrıca vergi belgesi İSTENMEZ — tekrar olurdu.
      expect(cn).not.toContain("taxPlate");
    });

    it("BAE'de vergi belgesi zorunlu DEĞİL (TRN yalnız KDV mükellefinde)", () => {
      expect(requiredDocsForCountry("AE")).not.toContain("taxPlate");
    });

    it("Rusya ortak yabancı temeli (sicil + vergi + kimlik)", () => {
      expect(requiredDocsForCountry("RU")).toEqual([
        "tradeRegistry",
        "taxPlate",
        "idFront",
      ]);
    });

    it("eski davranışın tersine, iki ülke AYNI listeyi paylaşmıyor", () => {
      // Regresyon kapısı: eskiden TÜM yabancılar aynı 3 belgeyi alıyordu.
      const cn = requiredDocsForCountry("CN").join(",");
      const ru = requiredDocsForCountry("RU").join(",");
      expect(cn).not.toBe(ru);
    });
  });

  // NOT: burada "yaptırım/yüksek risk kovası" testleri vardı
  // (`enhancedDueDiligence`). KALDIRILDI — firma doğrulaması zaten İSTİSNASIZ
  // manuel (`VERIFIED` yalnız admin `setVerification` ile yazar, otomatik
  // onay yolu yok), dolayısıyla bayrak operasyonel olarak hiçbir şey
  // yapmıyordu. Ülkeden bağımsız tek kural: her firma elle incelenir.

  describe("MEVCUT firmalar kilitlenmez", () => {
    it("kapalı ülkedeki eski kayıt için belge kümesi YİNE de hesaplanır", () => {
      // Kapı yalnız YENİ kayda uygulanır; ABD'de kayıtlı eski bir firma varsa
      // KYC ekranı çalışmaya devam etmeli.
      expect(requiredDocsForCountry("US")).toHaveLength(3);
      expect(getCountryProfile("US")).toMatchObject({ registrationOpen: false });
    });

    it("bilinmeyen/boş ülke ortak temele düşer, patlamaz", () => {
      expect(requiredDocsForCountry(null)).toEqual([
        "tradeRegistry",
        "taxPlate",
        "idFront",
      ]);
      expect(requiredDocsForCountry("ZZ")).toHaveLength(3);
    });
  });

  it("profil kodları tekil", () => {
    const codes = COUNTRY_PROFILES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("her profilde vergi no ETİKETİ var (kullanıcı ne gireceğini bilsin)", () => {
    for (const p of COUNTRY_PROFILES) {
      expect(p.taxIdLabel.length).toBeGreaterThan(3);
    }
  });
});
