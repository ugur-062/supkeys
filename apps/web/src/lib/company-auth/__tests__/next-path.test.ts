import { describe, expect, it } from "vitest";
import { isPlausibleEmail } from "../email";
import { loginLinkFromSignup, safeNextPath, signupLinkFromLogin } from "../next-path";
import { resendEmailCodeOutcome } from "../resend-code";

// Arayüz testi 2026-10 login-12: `next` yalnız NORMALLEŞTİRİLMİŞ yolu
// `/company` altında kalan hedefi kabul eder.
describe("safeNextPath", () => {
  it("panel içi yol sorgu ve çapayla aynen döner", () => {
    expect(safeNextPath("/company")).toBe("/company");
    expect(safeNextPath("/company/ilan/abc?tab=1")).toBe("/company/ilan/abc?tab=1");
    expect(safeNextPath("/company/satis?q=ROT-000001#acik-talepler")).toBe(
      "/company/satis?q=ROT-000001#acik-talepler",
    );
  });

  it("nokta parçalarıyla panelden çıkan yol panoya düşer (yönlendirici `/urunler`e indirgerdi)", () => {
    expect(safeNextPath("/company/../urunler")).toBe("/company");
    expect(safeNextPath("/company/%2e%2e/urunler")).toBe("/company");
    expect(safeNextPath("/company/%2E%2E/%2e%2e/firmalar")).toBe("/company");
    expect(safeNextPath("/company/ayarlar/../../urunler")).toBe("/company");
    expect(safeNextPath("/company/..")).toBe("/company");
  });

  it("panel İÇİNDE kalan nokta parçası normalleşir", () => {
    expect(safeNextPath("/company/ayarlar/../ilan/1")).toBe("/company/ilan/1");
    expect(safeNextPath("/company/./ilan/1?tab=1")).toBe("/company/ilan/1?tab=1");
  });

  it("dış kök ve benzer adlar reddedilir", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/company//x",
      "/companyfoo",
      "/urunler",
      "company/x",
      "/company/x?u=http://evil.example",
      "/company/\tx",
    ]) {
      expect(safeNextPath(bad), String(bad)).toBe("/company");
    }
  });

  // Kayıt denetimi 2026-10 web-auth-5: `?next=/company/login` ile giriş sayfası
  // kendi adresine yönleniyor, girişli ziyaretçi yükleme kutusunda kalıyordu.
  it("giriş sayfasının kendisi hedef olamaz: panoya düşer", () => {
    for (const self of [
      "/company/login",
      "/company/login/",
      "/company/login?x=1",
      "/company/login#form",
      "/company/login?next=%2Fcompany%2Filan%2F1",
      "/company/ayarlar/../login",
      // Yüzde kaçışlı yazım da aynı sayfaya çözülür.
      "/company/%6cogin",
      "/company/%6Cogin/",
    ]) {
      expect(safeNextPath(self), self).toBe("/company");
    }
  });

  it("adı giriş sayfasına benzeyen başka panel yolları etkilenmez", () => {
    expect(safeNextPath("/company/login-gecmisi")).toBe("/company/login-gecmisi");
    expect(safeNextPath("/company/ayarlar/login")).toBe("/company/ayarlar/login");
    expect(safeNextPath("/company/login/alt")).toBe("/company/login/alt");
    // Bozuk kaçış dizisi çözülemez; yol olduğu gibi değerlendirilir.
    expect(safeNextPath("/company/ilan/%E0%A4%A")).toBe("/company/ilan/%E0%A4%A");
  });
});

// Arayüz testi 2026-10 code-auth-8: kayıt ↔ giriş bağlantıları dönüş hedefini taşır.
describe("kayıt ↔ giriş bağlantıları", () => {
  it("kayıt → giriş: `redirect` `next` olur, `ref` ve `intent` aynen", () => {
    expect(loginLinkFromSignup({ target: "/company/ilan/l1", ref: "tok", intent: "teklif" })).toBe(
      "/company/login?next=%2Fcompany%2Filan%2Fl1&ref=tok&intent=teklif",
    );
    expect(loginLinkFromSignup({})).toBe("/company/login");
    expect(loginLinkFromSignup({ target: null, ref: undefined, intent: null })).toBe("/company/login");
  });

  it("giriş → kayıt: `next` `redirect` olur; gidip dönünce hedef aynı kalır", () => {
    const signup = signupLinkFromLogin({ target: "/company/ilan/l1", ref: "tok" });
    expect(signup).toBe("/company/kayit?redirect=%2Fcompany%2Filan%2Fl1&ref=tok");
    const back = new URL(signup, "http://n").searchParams;
    expect(loginLinkFromSignup({ target: back.get("redirect"), ref: back.get("ref") })).toBe(
      "/company/login?next=%2Fcompany%2Filan%2Fl1&ref=tok",
    );
  });

  it("site dışı hedef taşınmaz", () => {
    expect(loginLinkFromSignup({ target: "//evil.example" })).toBe("/company/login");
    expect(signupLinkFromLogin({ target: "https://evil.example", ref: "tok" })).toBe("/company/kayit?ref=tok");
  });
});

// Arayüz testi 2026-10 code-auth-7: kayıt, giriş ve şifremi unuttum AYNI gevşek kural.
describe("isPlausibleEmail", () => {
  it("API'nin (IsEmail) kabul ettiği ama zod `.email()`in reddettiği adresler geçer", () => {
    for (const ok of [
      "ada@firma.com",
      "satis&pazarlama@firma.com",
      "a/b=c!d#e@firma.com.tr",
      "info@şirket.com.tr",
      "  ada@firma.com  ",
    ]) {
      expect(isPlausibleEmail(ok), ok).toBe(true);
    }
  });

  it("bariz yazım hataları geçmez", () => {
    for (const bad of ["", "abc", "abc@", "ayse@firma", "@firma.com", "ayse veli@firma.com", "a b@c.com", "ayse@firma. com"]) {
      expect(isPlausibleEmail(bad), bad).toBe(false);
    }
  });
});

// Arayüz testi 2026-10 code-auth-3: "gönderildi" yalnız kod gerçekten çıktıysa.
describe("resendEmailCodeOutcome", () => {
  it("sent:true ve eski API yanıtı ({ success }) → sent", () => {
    expect(resendEmailCodeOutcome({ success: true, sent: true })).toBe("sent");
    expect(resendEmailCodeOutcome({ success: true })).toBe("sent");
    expect(resendEmailCodeOutcome(undefined)).toBe("sent");
  });
  it("sent:false → failed; capped → capped (saatlik tavan)", () => {
    expect(resendEmailCodeOutcome({ success: true, sent: false })).toBe("failed");
    expect(resendEmailCodeOutcome({ success: true, sent: false, capped: true })).toBe("capped");
  });
});
