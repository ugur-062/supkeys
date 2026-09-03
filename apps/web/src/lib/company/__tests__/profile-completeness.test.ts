import { describe, expect, it } from "vitest";
import { profileCompleteness } from "../profile-completeness";

/**
 * Profil tamamlanma — Profilim sayfası (taslak, dize alanlar) ile pano kartı
 * (API profili, null/number alanlar) AYNI sonucu almalı.
 */
describe("profileCompleteness", () => {
  it("boş profil %0 ve tüm alanlar eksik", () => {
    const r = profileCompleteness({});
    expect(r.pct).toBe(0);
    expect(r.missing).toHaveLength(11);
    expect(r.missing[0]).toBe("Logo");
  });

  it("taslak (dize) ve API (null/number) biçimleri aynı yüzdeyi verir", () => {
    const fromDraft = profileCompleteness({
      logoUrl: "https://cdn/x.png",
      coverImageUrl: "",
      aboutText: "  Hakkımızda  ",
      services: ["Montaj"],
      photos: [],
      foundedYear: "1998",
      employeeCount: "",
      website: "",
      industry: "Elektrik",
      city: "İzmir",
      buyerCategoryIds: [],
      sellerCategoryIds: ["39000000"],
    });
    const fromApi = profileCompleteness({
      logoUrl: "https://cdn/x.png",
      coverImageUrl: null,
      aboutText: "Hakkımızda",
      services: ["Montaj"],
      photos: null,
      foundedYear: 1998,
      employeeCount: null,
      website: null,
      industry: "Elektrik",
      city: "İzmir",
      buyerCategoryIds: null,
      sellerCategoryIds: ["39000000"],
    });
    expect(fromDraft).toEqual(fromApi);
    expect(fromDraft.pct).toBe(64); // 7 / 11
    expect(fromDraft.missing).toEqual(["Kapak", "Fotoğraflar", "Çalışan sayısı", "Web sitesi"]);
  });

  it("yalnız boşluktan oluşan metin dolu SAYILMAZ", () => {
    expect(profileCompleteness({ aboutText: "   " }).missing).toContain("Hakkında");
  });
});
