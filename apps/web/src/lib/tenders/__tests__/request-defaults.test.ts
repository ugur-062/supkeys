import { describe, expect, it } from "vitest";
import { REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";
import { DEFAULT_FORM_VALUES } from "../form-schema";
import { applyRequestDefaults, closesAtFromDays, defaultsFromForm, deliveryTermsFor, initialRequestFormValues, paymentCategoriesFor } from "../request-defaults";

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
    isSealedBid: true,
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
      isSealedBid: true,
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
