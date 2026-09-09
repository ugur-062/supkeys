import { describe, expect, it } from "vitest";
import {
  companySeoReadiness,
  listingSeoReadiness,
  productSeoReadiness,
  sentenceCount,
} from "@rothern/shared";

/**
 * Arama görünürlüğü puanı — yönlendirir, zorlamaz. Sözleşme: dürüst seçenek
 * cezasız (ON_REQUEST + MOQ tam puan), eksikler puan sırasına göre.
 */
const LONG =
  "Paslanmaz çelik dirsek, AISI 316 alaşımından üretilir ve gıda, ilaç ve kimya tesislerinde kullanılır. Kaynaklı bağlantıya uygundur ve DIN 2605 normuna göre ölçülendirilir. Ambalaj koli içinde 50 adettir ve stoktan sevk edilir. Talep hâlinde malzeme sertifikası verilir. Ürün Avrupa Birliği basınçlı ekipman yönetmeliğine uygun olarak üretilmektedir.";

describe("productSeoReadiness", () => {
  it("dolu ürün 'iyi', boş ürün 'zayıf'; eksikler puan sırasında", () => {
    const good = productSeoReadiness({
      name: "Paslanmaz çelik dirsek 90° DN50",
      description: LONG,
      images: ["a", "b", "c"],
      keywords: ["dirsek", "paslanmaz", "dn50"],
      categoryId: "40101700",
      attributeCount: 3,
      brand: "Acme",
      moq: "50",
      priceMode: "ON_REQUEST",
    });
    expect(good.score).toBe(100);
    expect(good.level).toBe("good");

    const weak = productSeoReadiness({ name: "Ürün 1", description: "kısa", images: [], keywords: [], categoryId: null, attributeCount: 0 });
    expect(weak.level).toBe("weak");
    expect(weak.missing[0].key).toBe("description"); // 20 puan — en değerlisi önce
    expect(weak.missing.map((m) => m.key)).toContain("title");
  });

  it("'teklif isteyin' + MOQ tam puan — dürüst seçenek cezasız", () => {
    const r = productSeoReadiness({ name: "x", description: null, images: [], keywords: [], categoryId: null, attributeCount: 0, moq: "1", priceMode: "ON_REQUEST" });
    expect(r.checks.find((c) => c.key === "commerce")?.ok).toBe(true);
  });

  it("cümle sayacı madde listesini cümle saymaz", () => {
    expect(sentenceCount("Birinci cümle burada. İkinci cümle de burada! Üçüncü mü?")).toBe(3);
    expect(sentenceCount("- a\n- b\n- c")).toBe(0);
  });
});

describe("companySeoReadiness", () => {
  it("web sitesi ve LinkedIn http(s) ister; kategori ≥3", () => {
    const r = companySeoReadiness({
      aboutText: LONG,
      logoUrl: "l",
      coverImageUrl: "c",
      industry: "Makine",
      city: "İzmir",
      website: "acme.com",
      linkedinUrl: null,
      foundedYear: 1998,
      employeeCount: "11-50",
      services: ["a", "b", "c"],
      certifications: [],
      photos: [],
      categoryCount: 2,
      publishedProductCount: 0,
    });
    const keys = r.missing.map((m) => m.key);
    expect(keys).toContain("website");
    expect(keys).toContain("categories");
    expect(keys).toContain("products"); // 0 puan ama uyarı olarak listede
    expect(r.checks.find((c) => c.key === "about")?.ok).toBe(true);
  });
});

describe("listingSeoReadiness", () => {
  it("başlıkta sayı, açıklama ≥200, kalemlerde miktar/birim/açıklama", () => {
    const r = listingSeoReadiness({
      title: "Malzeme alımı",
      description: "kısa",
      categoryIds: [],
      items: [{ name: "boru", quantity: 0, unit: "", description: "" }],
    });
    expect(r.level).toBe("weak");
    expect(r.missing.map((m) => m.key)).toEqual(expect.arrayContaining(["title", "specific", "description", "category", "items", "itemDetail"]));

    const ok = listingSeoReadiness({
      title: "3/4 inç dikişsiz çelik boru alımı — 1.200 metre",
      description: LONG,
      categoryIds: ["30000000"],
      items: [{ name: "boru", quantity: 1200, unit: "metre", description: "ST37, 3/4 inç, dikişsiz, 6 m boy" }],
    });
    expect(ok.score).toBe(100);
  });
});
