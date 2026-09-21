import { describe, expect, it } from "vitest";
import { REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";
import { DEFAULT_FORM_VALUES } from "../form-schema";
import { applyRequestDefaults, closesAtFromDays, defaultsFromForm, deliveryTermsFor, paymentCategoriesFor } from "../request-defaults";

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
    const now = new Date("2026-09-09T10:00:00");
    const form = applyRequestDefaults(DEFAULT_FORM_VALUES, SAVED, now);
    expect(form.deliveryTerm).toBe("FOB");
    expect(form.bidsCloseAt).toBe(closesAtFromDays(14, now));
    expect(defaultsFromForm(form, 14)).toEqual(SAVED);
  });

  it("profil yoksa platform varsayılanı (tüm ülkeler, adrese teslim, kapalı zarf, TRY, 7 gün)", () => {
    const form = applyRequestDefaults(DEFAULT_FORM_VALUES, null, new Date("2026-09-09T10:00:00"));
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
