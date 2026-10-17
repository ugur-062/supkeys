import {
  formatVerificationReason,
  isValidForeignTaxId,
  isValidTaxIdForCountry,
  isValidTaxIdForRule,
  normalizeTaxId,
  parseVerificationReason,
} from "@rothern/shared";
import { localizeDefaultAddressTitle } from "../../src/common/company/default-address-title";
import { parseViesResponse } from "../../src/modules/company-auth/services/company-auth.service";

/**
 * Yabancı kayıt/KYC denetimi (2026-09-27) — saf kurallar:
 *  · vergi no normalizasyonu + ülke kuralı (web formu ve API AYNI fonksiyon),
 *  · kodlu red gerekçesi (şema değişikliği olmadan "[KOD] not"),
 *  · kayıtta yazılan varsayılan adres başlığının okuyucu diline çevrilmesi,
 *  · VIES yanıt ayrıştırması (gerçek biçim `isValid`).
 */
describe("normalizeTaxId", () => {
  it("baştaki etiketi ve firmanın ülke önekini atar, rakamları ASCII'ye çevirir", () => {
    expect(normalizeTaxId("ИНН 7707083893", "RU")).toBe("7707083893");
    expect(normalizeTaxId("БИН: 123 456 789 012", "KZ")).toBe("123456789012");
    expect(normalizeTaxId("VAT DE811569869", "DE")).toBe("811569869");
    expect(normalizeTaxId("DE 811569869", "DE")).toBe("811569869");
    expect(normalizeTaxId("EL094014201", "GR")).toBe("094014201");
    expect(normalizeTaxId("TRN ١٠٠١٢٣٤٥٦٧٠٠٠٠٣", "AE")).toBe("100123456700003");
    expect(normalizeTaxId("NL123456789B01", "NL")).toBe("123456789B01");
  });

  it("kodun parçası olan harflere dokunmaz", () => {
    // İsviçre UID "CHE-…": "CH" ardından harf geliyor → önek değil.
    expect(normalizeTaxId("CHE-123.456.789", "CH")).toBe("CHE-123.456.789");
    // "VATAN…" etiket değil (ardından harf).
    expect(normalizeTaxId("VATAN-12345", "AL")).toBe("VATAN-12345");
    // Avusturya "ATU…": önek ardından harf → aynen (VIES AT'yi ayrıca atar).
    expect(normalizeTaxId("ATU12345678", "AT")).toBe("ATU12345678");
  });

  it("TR'ye ülke öneki kuralı uygulanmaz; boşluklar atılır", () => {
    expect(normalizeTaxId("123 456 7890", "TR")).toBe("1234567890");
  });
});

describe("ülke kuralına göre vergi no", () => {
  it("RU: ИНН 10/12, ОГРН 13, ОГРНИП 15 hane", () => {
    expect(isValidTaxIdForCountry("7707083893", "RU", false)).toBe(true);
    expect(isValidTaxIdForCountry("500100732259", "RU", false)).toBe(true);
    expect(isValidTaxIdForCountry("1027700132195", "RU", false)).toBe(true);
    expect(isValidTaxIdForCountry("770708389", "RU", false)).toBe(false);
    expect(isValidTaxIdForCountry("ИНН 7707083893", "RU", false)).toBe(true);
  });

  it("KZ 12, UZ 9/14, AZ 10 hane", () => {
    expect(isValidTaxIdForCountry("123456789012", "KZ", false)).toBe(true);
    expect(isValidTaxIdForCountry("12345678901", "KZ", false)).toBe(false);
    expect(isValidTaxIdForCountry("123456789", "UZ", false)).toBe(true);
    expect(isValidTaxIdForCountry("12345678901234", "UZ", true)).toBe(true);
    expect(isValidTaxIdForCountry("1234567890", "AZ", false)).toBe(true);
    expect(isValidTaxIdForCountry("123456789", "AZ", false)).toBe(false);
  });

  it("CN: USCC 18 karakter, I/O/S/V/Z yok", () => {
    expect(isValidTaxIdForCountry("91110000600037341L", "CN", false)).toBe(true);
    expect(isValidTaxIdForCountry("91110000600037341", "CN", false)).toBe(false);
    expect(isValidTaxIdForRule("9111000060003734IO", "CN_USCC")).toBe(false);
  });

  it("AE: 15 haneli TRN ya da ticaret ruhsatı no (serbest bölgede TRN yok)", () => {
    expect(isValidTaxIdForCountry("100123456700003", "AE", false)).toBe(true);
    expect(isValidTaxIdForCountry("DMCC-123456", "AE", false)).toBe(true);
  });

  it("genel kural: alt sınır 4 karakter (API DTO ile aynı), Arap-Hint rakam kabul", () => {
    expect(isValidForeignTaxId("ABC")).toBe(false);
    expect(isValidForeignTaxId("AB12")).toBe(true);
    expect(isValidTaxIdForCountry("٠١٢٣٤٥٦٧٨", "EG", false)).toBe(true);
  });
});

describe("kodlu red gerekçesi", () => {
  it("kod + not biçimlenir ve geri ayrıştırılır", () => {
    expect(formatVerificationReason("UNREADABLE", " sayfa 2 ")).toBe("[UNREADABLE] sayfa 2");
    expect(formatVerificationReason("OUTDATED")).toBe("[OUTDATED]");
    expect(formatVerificationReason(null, "serbest")).toBe("serbest");
    expect(formatVerificationReason(null, "  ")).toBeNull();
    expect(parseVerificationReason("[UNREADABLE] sayfa 2")).toEqual({ code: "UNREADABLE", note: "sayfa 2" });
    expect(parseVerificationReason("[OUTDATED]")).toEqual({ code: "OUTDATED", note: null });
  });

  it("kodsuz ya da tanınmayan kodlu eski metin olduğu gibi not sayılır", () => {
    expect(parseVerificationReason("Belge bulanık")).toEqual({ code: null, note: "Belge bulanık" });
    expect(parseVerificationReason("[FOO] x")).toEqual({ code: null, note: "[FOO] x" });
    expect(parseVerificationReason(null)).toEqual({ code: null, note: null });
  });
});

describe("varsayılan adres başlığı okuyucu dilinde", () => {
  it("herhangi bir dildeki varsayılan başlık okuyucu diline çevrilir; özel başlık aynen", () => {
    expect(localizeDefaultAddressTitle("Merkez", "ru")).toBe("Головной офис");
    expect(localizeDefaultAddressTitle("Head office", "tr")).toBe("Merkez");
    expect(localizeDefaultAddressTitle("Teslimat (fatura ile aynı)", "en")).toBe("Delivery (same as billing)");
    expect(localizeDefaultAddressTitle("Depo 2", "en")).toBe("Depo 2");
  });
});

describe("VIES yanıtı", () => {
  it("gerçek biçim isValid; '---' ad null; servis kodları unavailable", () => {
    expect(parseViesResponse({ isValid: true, userError: "VALID", name: "---", address: "---" })).toEqual({
      valid: true,
      name: null,
      address: null,
    });
    expect(parseViesResponse({ isValid: false, userError: "INVALID" })).toMatchObject({ valid: false });
    expect(parseViesResponse({ isValid: false, userError: "MS_UNAVAILABLE" })).toMatchObject({
      valid: false,
      unavailable: true,
    });
    // Eski/yedek biçim de okunur.
    expect(parseViesResponse({ valid: true, name: "ACME" })).toMatchObject({ valid: true, name: "ACME" });
  });
});
