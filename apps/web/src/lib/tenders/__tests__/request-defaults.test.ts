import { describe, expect, it } from "vitest";
import { REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";
import { DEFAULT_FORM_VALUES } from "../form-schema";
import { applyRequestDefaults, closesAtFromDays, defaultsFromForm, deliveryTermsFor, fallbackVisibilityFor, initialRequestFormValues, normalizeRequestDefaults, paymentCategoriesFor, withVisibleCategories } from "../request-defaults";

const SAVED: RequestDefaults = {
  targetCountries: ["DE", "NL"],
  visibility: "PUBLIC",
  deliveryTerm: "FOB",
  paymentCategory: "LETTER_OF_CREDIT",
  paymentDays: 90,
  advancePercent: null,
  lcType: "USANCE",
  primaryCurrency: "USD",
  allowedCurrencies: ["USD", "EUR"],
  isSealedBid: true,
  bidVisibility: "OWN_ONLY",
  requireAllItems: true,
  requireBidDocument: false,
  closeDays: 14,
  deliveryAddressId: "addr1",
  billingSameAsDelivery: false,
};

describe("talep şartları ↔ form", () => {
  it("profil → form → profil gidiş-dönüşü kayıpsız", () => {
    const now = new Date("2026-09-09T10:00:00+03:00");
    const form = applyRequestDefaults(DEFAULT_FORM_VALUES, SAVED, now);
    expect(form.deliveryTerm).toBe("FOB");
    expect(form.bidsCloseAt).toBe(closesAtFromDays(14, now));
    expect(defaultsFromForm(form, 14)).toEqual(SAVED);
  });

  it("profil yoksa platform varsayılanı (tüm ülkeler, adrese teslim, kapalı zarf, TRY, 7 gün)", () => {
    const form = applyRequestDefaults(DEFAULT_FORM_VALUES, null, new Date("2026-09-09T10:00:00+03:00"));
    expect(form.targetCountries).toEqual([]);
    expect(form.deliveryTerm).toBe("DOMESTIC_DELIVERED");
    expect(form.primaryCurrency).toBe("TRY");
    expect(form.bidsCloseAt).toBe("2026-09-16T10:00");
    expect(defaultsFromForm(form, 7)).toEqual({ ...REQUEST_DEFAULTS_FALLBACK, deliveryAddressId: null });
  });

  it("kapalı zarf formda yok (T-16): eski profilde false olsa da form okumaz, profile her zaman true yazılır", () => {
    const form = applyRequestDefaults(DEFAULT_FORM_VALUES, { ...SAVED, isSealedBid: false }, new Date("2026-09-09T10:00:00+03:00"));
    expect("isSealedBid" in form).toBe(false);
    expect(defaultsFromForm(form, 14).isSealedBid).toBe(true);
  });

  it("D-246: bağlantısız firmada platform varsayılanı Bağlantılarım → Herkese açık; diğerleri değişmez", () => {
    expect(fallbackVisibilityFor("CONNECTIONS", 0)).toBe("PUBLIC");
    expect(fallbackVisibilityFor("CONNECTIONS", 2)).toBe("CONNECTIONS");
    expect(fallbackVisibilityFor("PRIVATE", 0)).toBe("PRIVATE");
    expect(fallbackVisibilityFor("PUBLIC", 0)).toBe("PUBLIC");
  });

  it("teslim şekli ve ödeme listeleri ülkeye göre SÜZÜLMEZ (2026-09-21)", () => {
    const all = ["DOMESTIC_DELIVERED", "DOMESTIC_PICKUP", "EXW", "FOB"];
    expect(deliveryTermsFor(all)).toEqual(all);
    expect(paymentCategoriesFor()).toContain("LETTER_OF_CREDIT");
    expect(paymentCategoriesFor()).toContain("OPEN_ACCOUNT");
  });
});

/**
 * Derin denetim Y-19: düzenleme/kopya/şablon açılışında firmanın varsayılan
 * şartları talebin KENDİ şartlarını eziyordu (özel/USD/akreditifli talep
 * yalnız başlığı düzeltilip kaydedilince herkese açık/TRY oluyordu).
 */
describe("hızlı kart açılış değerleri (initialRequestFormValues)", () => {
  const now = new Date("2026-09-29T10:00:00+03:00");
  // Firma varsayılanı: herkese açık, TRY, vadeli 30 gün, 7 gün.
  const PROFILE: RequestDefaults = {
    ...SAVED,
    targetCountries: [],
    visibility: "PUBLIC",
    deliveryTerm: "DOMESTIC_DELIVERED",
    paymentCategory: "DEFERRED",
    paymentDays: 30,
    lcType: null,
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    isSealedBid: false,
    bidVisibility: "BEST_PRICE",
    closeDays: 7,
    deliveryAddressId: "addr-default",
  };
  // Talebin kendi şartları: özel, USD, akreditif, 15 Ekim kapanış.
  const LISTING = {
    ...DEFAULT_FORM_VALUES,
    title: "Çelik boru",
    visibility: "PRIVATE" as const,
    targetCountries: ["DE"],
    deliveryTerm: "FOB" as const,
    paymentCategory: "LETTER_OF_CREDIT" as const,
    lcType: "SIGHT" as const,
    paymentDays: undefined,
    primaryCurrency: "USD" as const,
    allowedCurrencies: ["USD" as const],
    bidVisibility: "OWN_ONLY" as const,
    requireAllItems: true,
    bidsCloseAt: "2026-10-15T17:00",
    deliveryAddressId: "addr-listing",
  };

  it("düzenleme: talebin şartları AYNEN korunur, profil uygulanmaz", () => {
    const f = initialRequestFormValues("edit", LISTING, PROFILE, now);
    expect(f).toMatchObject({
      visibility: "PRIVATE",
      targetCountries: ["DE"],
      deliveryTerm: "FOB",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      primaryCurrency: "USD",
      allowedCurrencies: ["USD"],
      bidVisibility: "OWN_ONLY",
      requireAllItems: true,
      bidsCloseAt: "2026-10-15T17:00",
      deliveryAddressId: "addr-listing",
    });
    expect(f.paymentDays).toBeUndefined();
  });

  it("kopya: şartlar korunur; boş kapanış ve adres profilden dolar", () => {
    const f = initialRequestFormValues("seed", { ...LISTING, bidsCloseAt: "", deliveryAddressId: "" }, PROFILE, now);
    expect(f).toMatchObject({ visibility: "PRIVATE", primaryCurrency: "USD", paymentCategory: "LETTER_OF_CREDIT", lcType: "SIGHT" });
    expect(f.bidsCloseAt).toBe(closesAtFromDays(7, now));
    expect(f.deliveryAddressId).toBe("addr-default");
  });

  it("kısmi şablon: şablondaki şartlar korunur, OLMAYAN alan profilden; ödeme alanları grup halinde", () => {
    // JSON'dan gelen eski şablon: paymentDays/lcType anahtarı yok.
    const tpl = { title: "Şablon", primaryCurrency: "EUR" as const, allowedCurrencies: ["EUR" as const], paymentCategory: "OPEN_ACCOUNT" as const };
    const f = initialRequestFormValues("seed", tpl, PROFILE, now);
    expect(f.primaryCurrency).toBe("EUR");
    expect(f.paymentCategory).toBe("OPEN_ACCOUNT");
    // Profilin vadesi (30) açık hesaba KARIŞMAZ.
    expect(f.paymentDays).toBeUndefined();
    expect(f.visibility).toBe("PUBLIC");
    expect(f.deliveryTerm).toBe("DOMESTIC_DELIVERED");
    expect(f.bidsCloseAt).toBe(closesAtFromDays(7, now));
  });

  it("boş kart (ve AI/ürün tohumu): şartlar profilden (eski davranış)", () => {
    const f = initialRequestFormValues("blank", { title: "AI taslağı" }, PROFILE, now);
    expect(f).toEqual(applyRequestDefaults({ ...DEFAULT_FORM_VALUES, title: "AI taslağı" }, PROFILE, now));
    expect(f.visibility).toBe("PUBLIC");
  });
});

/**
 * 2026-10-09 (W-11): tohum nereden gelirse gelsin (düzenleme, kopya, ŞABLON,
 * ürün, oturum taslağı) gizli segment kodu forma girmez. Şablon yükü hiçbir
 * eşleyiciden geçmediği için tek geçiş noktası açılış değerleridir.
 */
describe("hızlı kart açılış değerleri — gizli segment kodu forma girmez", () => {
  const now = new Date("2026-09-29T10:00:00+03:00");
  const seed = { ...DEFAULT_FORM_VALUES, title: "Eski şablon", categoryIds: ["46181500", "39121600", "10151500"] };

  it.each(["edit", "seed", "blank"] as const)("%s: yalnız görünür kategoriler kalır", (kind) => {
    expect(initialRequestFormValues(kind, seed, SAVED, now).categoryIds).toEqual(["39121600"]);
  });

  it("yalnız gizli kategorili şablon kategorisiz açılır (form güncel kategori ister)", () => {
    expect(initialRequestFormValues("seed", { ...seed, categoryIds: ["46181500"] }, SAVED, now).categoryIds).toEqual([]);
  });

  it("withVisibleCategories: gizli kod yoksa AYNI nesne (gereksiz kopya yok); eksik alan dokunulmaz", () => {
    const clean = { categoryIds: ["39121600"], title: "x" };
    expect(withVisibleCategories(clean)).toBe(clean);
    const none = { title: "x" } as { title: string; categoryIds?: string[] };
    expect(withVisibleCategories(none)).toBe(none);
    expect(withVisibleCategories({ categoryIds: ["46000000", "31161500"] })).toEqual({ categoryIds: ["31161500"] });
  });
});

describe("normalizeRequestDefaults (T-16)", () => {
  it("sunucudan gelen eski isSealedBid=false profile geri yazılmaz, diğer alanlar korunur", () => {
    const stale: RequestDefaults = { ...SAVED, isSealedBid: false };
    const out = normalizeRequestDefaults(stale);
    expect(out).toEqual({ ...SAVED, isSealedBid: true });
    expect(stale.isSealedBid).toBe(false);
  });
});
