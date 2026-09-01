import {
  COUNTRY_PROFILES,
  COUNTRIES,
  getCountryProfile,
  isRegistrationOpen,
  needsEnhancedDueDiligence,
  registrationCountries,
  requiredDocsForCountry,
} from "@rothern/shared";

/**
 * Ülke kapısı + belge profili sözleşmesi (Faz 1).
 *
 * Karar: kayıt SEKİZ ülkeye açık (TR, KKTC, RU, AZ, KZ, UZ, CN, AE).
 * Gerekçe `docs/plan-country-registration.md`.
 */
describe("Ülke profilleri", () => {
  const OPEN = ["TR", "XN", "RU", "AZ", "KZ", "UZ", "CN", "AE"];

  it("kayıt tam olarak SEKİZ ülkeye açık", () => {
    expect(registrationCountries().map((c) => c.code).sort()).toEqual(
      [...OPEN].sort(),
    );
  });

  it("AB ve Afrika BİLİNÇLİ olarak kapalı", () => {
    // Kapalıysa yeni kayıt alınmaz; ertelemenin maliyeti yok (VIES 27 ülkede
    // aynı doğrulama → AB sonradan tek seferde eklenir).
    for (const c of ["DE", "FR", "IT", "CY", "NG", "ZA", "EG", "KE"]) {
      expect(isRegistrationOpen(c)).toBe(false);
    }
  });

  it("her açık ülkenin görünen ADI var (kod göstermeyiz)", () => {
    for (const c of registrationCountries()) {
      expect(c.name).toBeTruthy();
      expect(c.name).not.toBe(c.code);
    }
  });

  it("KKTC ISO listesinde YOK ama profili var (kod XN)", () => {
    // ISO 3166-1'de KKTC kodu yoktur; kullanıcıya ayrılmış X-aralığı kullanıldı.
    expect(COUNTRIES.some((c) => c.code === "XN")).toBe(false);
    expect(isRegistrationOpen("XN")).toBe(true);
    expect(registrationCountries().find((c) => c.code === "XN")?.name).toMatch(
      /Kıbrıs/,
    );
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

  describe("yaptırım/yüksek risk kovası", () => {
    it("Rusya zorunlu manuel incelemeye düşer", () => {
      expect(needsEnhancedDueDiligence("RU")).toBe(true);
    });

    it("diğer açık ülkeler düşmez", () => {
      for (const c of OPEN.filter((x) => x !== "RU")) {
        expect(needsEnhancedDueDiligence(c)).toBe(false);
      }
    });

    it("kapı KAPATMAK yerine inceleme zorunlu kılıyor", () => {
      // Ülkeyi tümden kapatmak yerine incelemeyi zorunlu kılmak bilinçli:
      // uyum listesi kararı hukukta, ürün kararı değil.
      expect(isRegistrationOpen("RU")).toBe(true);
      expect(needsEnhancedDueDiligence("RU")).toBe(true);
    });
  });

  describe("MEVCUT firmalar kilitlenmez", () => {
    it("kapalı ülkedeki eski kayıt için belge kümesi YİNE de hesaplanır", () => {
      // Almanya kapalı ama orada kayıtlı eski bir firma varsa KYC ekranı
      // çalışmaya devam etmeli — kapı yalnız YENİ kayda uygulanır.
      const de = requiredDocsForCountry("DE");
      expect(de.length).toBeGreaterThan(0);
      expect(getCountryProfile("DE")).toBeNull(); // profili yok
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
