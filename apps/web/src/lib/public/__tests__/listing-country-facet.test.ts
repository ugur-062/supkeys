import { describe, expect, it } from "vitest";
import {
  hasListingCountryFacet,
  listingCountryCount,
  listingCountryOptions,
} from "../listing-country-facet";

describe("talep dizini ülke facet'i — her ülke seçilebilir (2026-09-27)", () => {
  it("sayı = tüm ülkelere açık + açıkça hedefleyen; hedeflenmemiş ülke yalnız açık olanları alır", () => {
    const f = { openToAll: 5, countries: [{ code: "TR", count: 2 }, { code: "AZ", count: 1 }] };
    expect(listingCountryCount(f, "TR")).toBe(7);
    expect(listingCountryCount(f, "DE")).toBe(5);
  });

  it("liste hedeflenen ülkeler + seçili ülke; sayıya göre, eşitlikte koda göre", () => {
    const f = { openToAll: 3, countries: [{ code: "AZ", count: 1 }, { code: "TR", count: 4 }, { code: "KZ", count: 1 }] };
    expect(listingCountryOptions(f)).toEqual([
      { code: "TR", count: 7 },
      { code: "AZ", count: 4 },
      { code: "KZ", count: 4 },
    ]);
    expect(listingCountryOptions(f, "DE").map((o) => o.code)).toEqual(["TR", "AZ", "KZ", "DE"]);
    // Seçili ülke API'den 0 açık hedefle gelse de (sunucu seçiliyi ekler) tek girdi.
    const withSelected = { ...f, countries: [...f.countries, { code: "DE", count: 0 }] };
    expect(listingCountryOptions(withSelected, "DE").filter((o) => o.code === "DE")).toEqual([{ code: "DE", count: 3 }]);
  });

  it("her talep tüm ülkelere açıkken de grup çizilir (eskiden hiç çizilmiyordu)", () => {
    expect(hasListingCountryFacet({ openToAll: 4, countries: [] })).toBe(true);
    expect(listingCountryOptions({ openToAll: 4, countries: [] })).toEqual([]);
    expect(hasListingCountryFacet({ openToAll: 0, countries: [] })).toBe(false);
    expect(hasListingCountryFacet({ openToAll: 0, countries: [] }, "DE")).toBe(true);
    // Eski kenar önbelleği alanları taşımayabilir.
    expect(hasListingCountryFacet({})).toBe(false);
  });
});
