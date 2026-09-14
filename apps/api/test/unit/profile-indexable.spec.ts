import { isProfileIndexable } from "../../src/common/company/public-profile-gate";

/**
 * VİTRİN ≠ İNDEKS — PROFİL TARAFI (2026-09-15).
 *
 * İlan tarafında bu ayrım vardı, profil tarafında YOKTU — profiller opt-in
 * olduğu için sorun görünmüyordu. Kayıtta `publicEnabled` varsayılanı açılınca
 * sorun gerçek oldu: içi boş profiller toplu hâlde Google'a giderdi.
 *
 * ÖLÇÜM: staging'de 26 firmanın SIFIRININ logosu vardı. Eşiksiz açsaydık
 * onlarca "ad + şehir"den ibaret sayfa indeksletirdik — ince içerik, ve tam da
 * kazanmaya çalıştığımız alan otoritesini AŞINDIRIR.
 *
 * Sayfa yine de VİTRİNDE kalır; kapanan yalnız sitemap ve robots.
 */
const TAM = {
  aboutText:
    "Yirmi yıldır paslanmaz çelik boru ve bağlantı elemanı üretiyoruz; gıda ve kimya sektörüne tedarik veriyoruz.",
  logoUrl: "https://cdn.rothern.com/l.png",
  website: "https://ornek.com",
  publicProductCount: 3,
};

describe("isProfileIndexable", () => {
  it("dolu profil indekslenir", () => {
    expect(isProfileIndexable(TAM)).toBe(true);
  });

  it("anlamlı tanıtım metni ŞART — tek sinyal yetmez", () => {
    expect(isProfileIndexable({ ...TAM, aboutText: null })).toBe(false);
    expect(isProfileIndexable({ ...TAM, aboutText: "" })).toBe(false);
    // `looksLikeProse`: test verisi ve tek kelimelik doldurma elenir.
    expect(isProfileIndexable({ ...TAM, aboutText: "asdasd" })).toBe(false);
    expect(isProfileIndexable({ ...TAM, aboutText: "test test" })).toBe(false);
  });

  it("metin varsa TEK somut sinyal yeter — üçünden herhangi biri", () => {
    const yalnizLogo = { ...TAM, website: null, publicProductCount: 0 };
    const yalnizSite = { ...TAM, logoUrl: null, publicProductCount: 0 };
    const yalnizUrun = { ...TAM, logoUrl: null, website: null };
    expect(isProfileIndexable(yalnizLogo)).toBe(true);
    expect(isProfileIndexable(yalnizSite)).toBe(true);
    expect(isProfileIndexable(yalnizUrun)).toBe(true);
  });

  it("metin var ama HİÇ somut sinyal yoksa indekslenmez", () => {
    expect(
      isProfileIndexable({
        ...TAM,
        logoUrl: null,
        website: null,
        publicProductCount: 0,
      }),
    ).toBe(false);
  });

  it("boşluktan ibaret alanlar sinyal SAYILMAZ", () => {
    expect(
      isProfileIndexable({
        ...TAM,
        logoUrl: "   ",
        website: "  ",
        publicProductCount: 0,
      }),
    ).toBe(false);
  });
});
