import { describe, expect, it } from "vitest";
import { LOCALES } from "../locales";
import { rawMessages, type MessageTree } from "../messages";

/**
 * Kayıt · giriş · onboarding · davet metinleri (kayıt denetimi 2026-10 üçüncü
 * tur). İki sözleşme:
 *
 * 1) ALAN HATALARI TEK BİÇİMDE (resignup-6). Aynı formda "Adınızı girin." ile
 *    "Geçerli bir e-posta adresi giriniz", "Vergi dairesini yazın" ile
 *    "… vergi numarası giriniz" yan yana duruyordu. Kural katalogdaki alan
 *    hatalarının çoğunluğudur: emir kipi "-in / -ın" ("girin", "yazın",
 *    "seçin" — "giriniz" değil) ve tek cümlelik iletinin sonunda nokta YOK.
 *    Birden çok cümleli ileti (ör. `password.max`) kendi noktalamasını taşır.
 *
 * 2) DAVET METİNLERİ OLANI SÖYLER (reinvite-new-1). Davet e-postası, alıcının
 *    davet listesi ve davet penceresi "bu adresle kaydolunca bağlantı otomatik
 *    kurulur" diyordu; oysa bağlantı yalnız davet e-postasındaki bağlantıyla
 *    kaydolunca hemen kurulur — sonradan davet edilen adresle kaydolan firmaya
 *    kabul etmesi gereken bir İSTEK gider.
 */
function at(tree: MessageTree, path: string): string {
  const node = path
    .split(".")
    .reduce<MessageTree | string | undefined>((acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined), tree);
  if (typeof node !== "string") throw new Error(`katalogda yok: ${path}`);
  return node;
}

/** `web.auth` altında bir alanın ALTINDA gösterilen tek cümlelik hata iletileri. */
const FIELD_ERRORS = [
  "auth.common.phoneCountryRequired",
  "auth.login.emailInvalid",
  "auth.login.passwordRequired",
  "auth.login.codeRequired",
  "auth.login.codeLength",
  "auth.forgot.emailInvalid",
  "auth.signup.emailInvalid",
  "auth.signup.phoneInvalid",
  "auth.signup.phoneRequired",
  "auth.signup.firstNameRequired",
  "auth.signup.lastNameRequired",
  "auth.signup.passwordRepeatRequired",
  "auth.signup.passwordRequired",
  "auth.signup.consentRequired",
  "auth.signup.codeLength",
  "auth.signup.newEmailSame",
  "auth.invite.phoneInvalid",
  "auth.password.min",
  "auth.password.lower",
  "auth.password.upper",
  "auth.password.digit",
  "auth.password.special",
  "auth.password.mismatch",
  "auth.onboarding.tcknInvalid",
  "auth.onboarding.vknInvalid",
  "auth.onboarding.taxForeignInvalid",
  "auth.onboarding.tcknInvalidPerson",
  "auth.onboarding.legalFormLocalRequired",
  "auth.onboarding.errLegalForm",
  "auth.onboarding.errLegalName",
  "auth.onboarding.errCountry",
  "auth.onboarding.errTaxOffice",
  "auth.onboarding.errWebsite",
  "auth.onboarding.errProvince",
  "auth.onboarding.errDistrict",
  "auth.onboarding.errCity",
  "auth.onboarding.errPostalTr",
  "auth.onboarding.errAddressLine",
  "auth.onboarding.categoryRequired",
  "auth.onboarding.errDeclaration",
] as const;

describe("kimlik formları — alan hataları tek biçimde (resignup-6)", () => {
  it.each(LOCALES)("%s: tek cümlelik alan hatası noktayla bitmez", (locale) => {
    const web = rawMessages(locale, "web");
    const offenders = FIELD_ERRORS.map((key) => [key, at(web, key)] as const).filter(([, text]) =>
      /[.!]$/.test(text.trim()),
    );
    expect(offenders).toEqual([]);
  });

  it("tr: emir kipi '-in / -ın' ('girin', 'yazın', 'seçin'); '-iniz / -ınız' biçimi yok", () => {
    const web = rawMessages("tr", "web");
    const offenders = FIELD_ERRORS.map((key) => [key, at(web, key)] as const).filter(([, text]) =>
      /(giriniz|yazınız|seçiniz|onaylayınız|belirtiniz|doldurunuz)(\s|$|[).,;])/i.test(text),
    );
    expect(offenders).toEqual([]);
  });

  it("boş telefon için ayrı ileti var ve 'seçili ülke' demez (resignup-5)", () => {
    expect(at(rawMessages("tr", "web"), "auth.signup.phoneRequired")).not.toMatch(/ülke/i);
    expect(at(rawMessages("en", "web"), "auth.signup.phoneRequired")).not.toMatch(/country/i);
    expect(at(rawMessages("ru", "web"), "auth.signup.phoneRequired")).not.toMatch(/стран/i);
  });
});

/**
 * Onboarding sihirbazı (inceleme 2026-10-08).
 *
 * 1) SON ADIMIN ADI YETKİLİYİ ANAR. Adım "yetkili kişi" bölümüyle (ad + kimlik
 *    no — Türkiye'de zorunlu) açılır. Rusça ad eski son adımın adı olarak
 *    kalmıştı ("Итог и заявление" = özet ve beyan): adım adından doldurulacak
 *    kişisel bir alan kaldığı anlaşılmıyordu.
 *
 * 2) RUSÇA ADIM ADLARI 360 px'TE ADIM GÖSTERGESİNE SIĞAR. Göstergede daralmayan
 *    genişlik = daireler ve boşluklar (140 px) + her adın EN UZUN sözcüğü;
 *    360 px'lik ekranda 328 px yer var. Ölçüm (Chromium, derlemenin Inter
 *    yazı tipi, 2026-10-08):
 *      · "Подписант и итог"            → 314 px gerekir, 14 px pay (2 satır);
 *      · "Представитель и заявление"   → 345 px gerekir, 17 px TAŞAR.
 *    Kiril harfte sözcük başına ≈ 7,7 px/harf: üç adın en uzun sözcükleri
 *    toplam 23 harfte sığıyor, 27 harfte taşıyor → tavan 24. Ad değişirse
 *    tarayıcıda yeniden ölçülür; bu test yalnız kaba bir bekçidir.
 *
 * 3) "DİĞER" KUTUSUNUN ÖRNEĞİ LİSTEDEKİ BİR YAPI DEĞİLDİR. Yerel hukuki yapı
 *    listesi olan ülkede örnek "kooperatif"ti; 17 ülkenin listesinde kooperatif
 *    var (Società cooperativa, eG, Genossenschaft…) → örneği izleyen kurucu
 *    onu serbest metin yazıp "Diğer" olarak kaydoluyordu. Örnekler bilerek
 *    listeye alınmayan yapılardır: vakıf, dernek, şube (`@rothern/shared`
 *    `data/legal-forms.ts`; karşı sözleşme api `legal-forms.spec`).
 */
describe("onboarding sihirbazı metinleri (inceleme 2026-10-08)", () => {
  it("son adımın adı yetkili kişiyi anar (üç dilde)", () => {
    const PERSON = { tr: /yetkili/i, en: /authorized person/i, ru: /подписант|представител/i };
    for (const locale of LOCALES) {
      expect([locale, at(rawMessages(locale, "web"), "auth.onboarding.step3")]).toEqual([
        locale,
        expect.stringMatching(PERSON[locale]),
      ]);
    }
  });

  it("ru: adım adlarının en uzun sözcükleri 360 px'lik adım göstergesine sığar (toplam ≤ 24 harf)", () => {
    const web = rawMessages("ru", "web");
    const longest = ["step1", "step2", "step3"].map((key) =>
      Math.max(...at(web, `auth.onboarding.${key}`).split(/\s+/).map((word) => word.length)),
    );
    expect(longest.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(24);
  });

  it("yerel listesi olan ülkede 'Diğer' kutusunun örneği kooperatif (listedeki yapı) değildir", () => {
    const COOPERATIVE = { tr: /kooperatif/i, en: /co-?operative/i, ru: /кооператив/i };
    for (const locale of LOCALES) {
      const text = at(rawMessages(locale, "web"), "auth.onboarding.legalFormLocalPlaceholderListed");
      expect([locale, text]).toEqual([locale, expect.not.stringMatching(COOPERATIVE[locale])]);
    }
  });
});

describe("davet metinleri olanı söyler (reinvite-new-1)", () => {
  /** Koşulsuz "otomatik / kalıcı bağlanır" vaadi. */
  const PROMISE = { tr: /otomatik|kalıcı bağlan/i, en: /automatic|permanently/i, ru: /автоматическ|постоянн/i };
  /** Sonradan kaydolan firmaya giden, kabul edilmesi gereken istek. */
  const REQUEST = { tr: /istek|isteğ/i, en: /request/i, ru: /запрос/i };
  /** Hemen bağlanmanın koşulu: davet e-postasındaki bağlantı / düğme. */
  const VIA_LINK = { tr: /bağlantıyla|düğmeyle|adresten/i, en: /link|button/i, ru: /ссылк|кнопк/i };

  const SURFACES: Array<["web" | "email", string]> = [
    // Davet e-postası: gövde paragrafı + tablo altı not birlikte, düz metin sürümü.
    ["email", "referralInvite.autoConnect+referralInvite.infoNote"],
    ["email", "referralInvite.textAutoConnect"],
    // Alıcının bekleyen davet satırı ve davet penceresinin açıklaması.
    ["web", "panel.company.connectionsView.kaydoluncaOtomatikBaglanir"],
    ["web", "panel.company.connectionsView.firmaninEPostasiniYazinKayitliysa"],
  ];

  describe.each(LOCALES)("%s", (locale) => {
    it.each(SURFACES)("%s:%s — bağlantıyla hemen, sonradan istek; koşulsuz 'otomatik' vaadi yok", (ns, keys) => {
      const tree = rawMessages(locale, ns);
      const text = keys
        .split("+")
        .map((key) => at(tree, key))
        .join(" ");
      expect(text).not.toMatch(PROMISE[locale]);
      expect(text).toMatch(VIA_LINK[locale]);
      expect(text).toMatch(REQUEST[locale]);
    });
  });

  it("e-posta yer tutucuları korunur (şablon aynı değişkenleri verir)", () => {
    for (const locale of LOCALES) {
      const email = rawMessages(locale, "email");
      expect(at(email, "referralInvite.autoConnect")).toContain("<b>{inviterName}</b>");
      const text = at(email, "referralInvite.textAutoConnect");
      expect(text).toContain("{inviterName}");
      expect(text).toContain("{email}");
    }
  });
});
