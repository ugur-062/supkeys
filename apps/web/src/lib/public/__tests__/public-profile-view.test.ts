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

  // 2026-10-09 (W-06): gizli segmentteki eski beyan herkese açık profile inmez
  // — çip çizilmez, adı RSC yüküne de düşmez.
  it("gizli segmentteki kategori beyanı görünüm verisine GİRMEZ; görünürler sırayla kalır", () => {
    const view = publicProfileViewData(
      profile({
        categories: [
          { id: "46000000", name: "Kolluk ve Emniyet Ekipmanları" },
          { id: "31000000", name: "Üretim Bileşenleri" },
          { id: "77000000", name: "Çevre Hizmetleri" },
          { id: "39000000", name: "Elektrik Sistemleri" },
        ] as PublicProfile["categories"],
      }),
      "tr",
    );
    expect(view.categories?.map((c) => c.id)).toEqual(["31000000", "39000000"]);
    expect(JSON.stringify(view)).not.toMatch(/Kolluk|Çevre Hizmetleri|46000000|77000000/);
    expect(publicProfileViewData(profile({ categories: [{ id: "46000000", name: "Kolluk" }] as PublicProfile["categories"] }), "tr").categories).toEqual([]);
  });

  it("çevrilmemiş profilde not yok; kapılı alanlar (Rothern ID, web sitesi) anahtar olarak bile yazılmaz", () => {
    const view = publicProfileViewData(profile(), "tr");
    expect(view.translatedFrom).toBeUndefined();
    for (const key of ["rothernId", "website", "linkedinUrl", "instagramUrl", "rating", "reviewSummary", "trade"]) {
      expect(Object.prototype.hasOwnProperty.call(view, key)).toBe(false);
    }
  });
});
