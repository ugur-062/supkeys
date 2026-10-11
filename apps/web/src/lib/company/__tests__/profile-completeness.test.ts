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
    expect(r.missing).toHaveLength(10);
    expect(r.missing[0]).toBe("Logo");
  });

  it("taslak (dize) ve API (null/number) biçimleri aynı yüzdeyi verir", () => {
    const fromDraft = profileCompleteness({
      logoUrl: "https://cdn/x.png",
      coverImageUrl: "",
      aboutText: "  Hakkımızda  ",
      services: ["Montaj"],
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
      foundedYear: 1998,
      employeeCount: null,
      website: null,
      industry: "Elektrik",
      city: "İzmir",
      buyerCategoryIds: null,
      sellerCategoryIds: ["39000000"],
    });
    expect(fromDraft).toEqual(fromApi);
    expect(fromDraft.pct).toBe(70); // 7 / 10 (Fotoğraflar maddesi 2026-09-10'da kalktı — galeri yok)
    expect(fromDraft.missing).toEqual(["Kapak", "Çalışan sayısı", "Web sitesi"]);
  });

  it("yalnız boşluktan oluşan metin dolu SAYILMAZ", () => {
    expect(profileCompleteness({ aboutText: "   " }).missing).toContain("Hakkında");
  });
});

describe("profileCompleteness — gizli segment beyanı (2026-10-09)", () => {
  it("tek beyanı gizli segmentte olan firma 'Faaliyet kategorileri' maddesini tamamlamış sayılmaz", () => {
    const hiddenOnly = profileCompleteness({ sellerCategoryIds: ["92000000"], buyerCategoryIds: ["77000000"] });
    expect(hiddenOnly.missingKeys).toContain("categories");
    const mixed = profileCompleteness({ sellerCategoryIds: ["92000000", "39000000"] });
    expect(mixed.missingKeys).not.toContain("categories");
  });

  // 2026-10-10: 46 görünür sektör, silah / kolluk dalları gizli. Beyan seçimi
  // ata zinciriyle saklar; gizli seçimin görünür atası (46000000) tek başına
  // "kategori var" SAYILMAZ — alt eksen verildiğinde hesap bunu görür.
  it("görünür sektör yalnız gizli bir seçimin atası olarak saklanmışsa madde eksik kalır", () => {
    const orphan = profileCompleteness({
      sellerCategoryIds: ["46000000"],
      sellerSubCategoryIds: ["46100000", "46101500"],
    });
    expect(orphan.missingKeys).toContain("categories");
    // Aynı sektörde görünür bir seçim de varsa (ya da sektörün tamamı beyan edildiyse) tamamdır.
    const withVisiblePick = profileCompleteness({
      sellerCategoryIds: ["46000000"],
      sellerSubCategoryIds: ["46100000", "46101500", "46180000", "46181500"],
    });
    expect(withVisiblePick.missingKeys).not.toContain("categories");
    expect(profileCompleteness({ buyerCategoryIds: ["46000000"], buyerSubCategoryIds: [] }).missingKeys).not.toContain("categories");
  });
});
