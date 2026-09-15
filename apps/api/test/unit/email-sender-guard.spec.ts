import { checkProdSenderDomain, expectedSenderDomain } from "../../src/common/config/email-sender";

/**
 * GÖNDEREN ADRESİ KAPISI — sözleşme.
 *
 * 2026-09-13'te canlı `onboarding@resend.dev` ile çalışıyordu: müşteriye giden
 * HER e-posta sağlayıcının test alan adından gidiyordu. Hata sessizdi —
 * gönderim başarılıydı, günlükte iz yoktu, tüm testler yeşildi. Tek belirtisi
 * müşterinin gelen kutusundaydı. Bu yüzden koruma boot kapısı.
 */
describe("Canlı gönderen adresi kapısı", () => {
  const prod = (fromAddress: string | undefined) =>
    checkProdSenderDomain({ nodeEnv: "production", fromAddress });

  it("kanonik alan adı geçer", () => {
    expect(prod("bildirim@rothern.com")).toBeNull();
    expect(prod("support@rothern.com")).toBeNull();
  });

  it("alt alan adı da geçer (sağlayıcı gönderim alt alanı)", () => {
    expect(prod("noreply@send.rothern.com")).toBeNull();
  });

  it("SAĞLAYICI TEST ALAN ADI REDDEDİLİR — canlıda görülen asıl hata", () => {
    expect(prod("onboarding@resend.dev")).toBe("not_canonical");
  });

  it("benzeyen ama farklı alan adı reddedilir (son ek tuzağı)", () => {
    // "notrothern.com" ve "rothern.com.tr" kanonik DEĞİL; naif `endsWith`
    // kontrolü ikisini de kaçırırdı.
    expect(prod("a@notrothern.com")).toBe("not_canonical");
    expect(prod("a@rothern.com.tr")).toBe("not_canonical");
  });

  it("boş ya da biçimsiz değer reddedilir", () => {
    expect(prod(undefined)).toBe("missing");
    expect(prod("")).toBe("missing");
    expect(prod("   ")).toBe("missing");
    expect(prod("bildirim-rothern.com")).toBe("missing");
  });

  it("büyük harf ve boşluk sorun değil", () => {
    expect(prod("  Bildirim@Rothern.COM  ")).toBeNull();
  });

  /**
   * 2026-09-16: staging ayrı kayıtlı alan adına taşındı (staging.supkeys.com).
   * Kapı sabit "rothern.com" beklediği için staging'i AÇILIŞTA öldürdü
   * ("No open ports detected"). Beklenen alan adı artık WEB_URL'den türüyor.
   */
  describe("beklenen alan adı SİTENİN alan adıdır", () => {
    const ortam = (fromAddress: string, webUrl: string) =>
      checkProdSenderDomain({ nodeEnv: "production", fromAddress, webUrl });

    it("staging kendi alan adından gönderir", () => {
      expect(ortam("staging@supkeys.com", "https://staging.supkeys.com")).toBeNull();
      expect(ortam("noreply@send.supkeys.com", "https://staging.supkeys.com")).toBeNull();
    });

    it("staging BAŞKA alan adından gönderemez (canlının alan adı dahil)", () => {
      expect(ortam("staging@rothern.com", "https://staging.supkeys.com")).toBe("not_canonical");
      expect(ortam("onboarding@resend.dev", "https://staging.supkeys.com")).toBe("not_canonical");
    });

    it("canlı davranışı değişmedi", () => {
      expect(ortam("bildirim@rothern.com", "https://www.rothern.com")).toBeNull();
      expect(ortam("onboarding@resend.dev", "https://www.rothern.com")).toBe("not_canonical");
    });

    it("WEB_URL okunamazsa kanonik alan adına düşer (fail-closed kalır)", () => {
      expect(expectedSenderDomain(undefined)).toBe("rothern.com");
      expect(expectedSenderDomain("bozuk")).toBe("rothern.com");
      expect(expectedSenderDomain("http://localhost:3000")).toBe("rothern.com");
      expect(expectedSenderDomain("https://staging.supkeys.com")).toBe("supkeys.com");
      expect(expectedSenderDomain("https://www.rothern.com")).toBe("rothern.com");
    });
  });

  it("prod DIŞINDA kapı inert — demo kendi adresini kullanır", () => {
    expect(checkProdSenderDomain({ nodeEnv: "development", fromAddress: "onboarding@resend.dev" })).toBeNull();
    expect(checkProdSenderDomain({ nodeEnv: "test", fromAddress: undefined })).toBeNull();
  });
});
