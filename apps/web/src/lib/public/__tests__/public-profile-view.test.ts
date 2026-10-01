import { describe, expect, it } from "vitest";
import type { PublicProfile } from "@/lib/public/marketplace-api";
import { publicProfileViewData } from "../public-profile-view";

function profile(over: Partial<PublicProfile> = {}): PublicProfile {
  return {
    name: "Anadolu İnşaat",
    slug: "anadolu-insaat",
    industry: "Construction",
    categories: [],
    city: "Ankara",
    country: "TR",
    logoUrl: null,
    coverImageUrl: null,
    photos: [],
    aboutText: "We build industrial facilities across Anatolia since 1998.",
    services: [],
    certifications: [],
    certificateImages: [],
    foundedYear: 1998,
    employeeCount: "50-249",
    ratingAvg: null,
    ...over,
  } as PublicProfile;
}

describe("publicProfileViewData (arayüz testi O-018)", () => {
  it("makine çevirisi yapılmış profilde translatedFrom taşınır → 'Otomatik çeviri' notu çizilir", () => {
    const view = publicProfileViewData(
      profile({ translatedFrom: "tr", readyLocales: ["tr", "en", "ru"], sourceLocale: "tr" }),
      "en",
    );
    expect(view.translatedFrom).toBe("tr");
    // Çeviri hazır → blok sayfanın dilinde, kaynak `lang`ı yazılmaz.
    expect(view.contentLang).toBeUndefined();
  });

  it("çevrilmemiş profilde not yok; kapılı alanlar (Rothern ID, web sitesi) anahtar olarak bile yazılmaz", () => {
    const view = publicProfileViewData(profile(), "tr");
    expect(view.translatedFrom).toBeUndefined();
    for (const key of ["rothernId", "website", "linkedinUrl", "instagramUrl", "rating", "reviewSummary", "trade"]) {
      expect(Object.prototype.hasOwnProperty.call(view, key)).toBe(false);
    }
  });
});
