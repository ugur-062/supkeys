import { describe, expect, it } from "vitest";
import type { PublicListingDetail } from "@/lib/public/marketplace-api";
import { categoryOgContent, cityOgContent, listingOgContent, productOgContent } from "../content";

const listing = {
  number: "ROT-000042",
  type: "ALIM",
  title: "Çelik boru alımı — 3/4 inç, dikişsiz",
  status: "OPEN",
  coverImageUrl: null,
  closesAt: "2026-10-01T00:00:00.000Z",
  publishedAt: null,
  primaryCurrency: "TRY",
  isInternational: false,
  itemCount: 2,
  itemSummary: { count: 2, totalQuantity: "1200", unit: "metre" },
  company: { city: "Ankara", country: "TR", industry: "İnşaat", activities: [], verified: true },
  categories: [{ id: "30000000", name: "Yapı Malzemeleri", level: 1 }],
} as unknown as PublicListingDetail;

describe("OG kart içeriği", () => {
  it("alım talebi: sahip adı/logosu HİÇBİR alanda yok, konum ve miktar var", () => {
    const c = listingOgContent({ ...listing, company: { ...listing.company, name: "GİZLİ FİRMA A.Ş." } } as never);
    const text = JSON.stringify(c);
    expect(text).not.toContain("GİZLİ FİRMA");
    expect(c.subtitle).toBe("Yapı Malzemeleri · Ankara");
    expect(c.facts).toContain("Miktar: 1200 metre");
    expect(c.facts).toContain("2 kalem");
    expect(c.badge).toBe("Teklife açık");
    expect(c.eyebrow).toContain("ROT-000042");
  });

  it("kapanan talep: rozet 'Kapandı', son teklif tarihi yazılmaz", () => {
    const c = listingOgContent({ ...listing, status: "AWARDED" });
    expect(c.badge).toBe("Kapandı");
    expect(c.facts.some((f) => f.startsWith("Son teklif"))).toBe(false);
  });

  it("ürün: fiyat/MOQ/marka çipleri, satıcı adı açık, ilk görsel", () => {
    const c = productOgContent(
      {
        name: "Paslanmaz Çelik Dirsek 90°",
        images: ["https://cdn.rothern.com/a.webp", "https://cdn.rothern.com/b.webp"],
        priceMode: "FIXED",
        priceAmount: "125.5",
        priceTiers: null,
        priceCurrency: "TRY",
        unit: "adet",
        moq: "50",
        brand: "Acme",
        category: { id: "40000000", name: "Boru ve Bağlantı" },
      } as never,
      { name: "Acme Metal", city: "İzmir", verified: true } as never,
    );
    expect(c.title).toBe("Paslanmaz Çelik Dirsek 90°");
    expect(c.subtitle).toBe("Acme Metal · İzmir");
    expect(c.facts).toEqual(["125,5 ₺ / adet", "Min. 50 adet", "Acme"]);
    expect(c.image).toBe("https://cdn.rothern.com/a.webp");
    expect(c.badge).toBe("Doğrulanmış tedarikçi");
  });

  it("fiyatı olmayan ürün dürüst: 'Fiyat için teklif isteyin'", () => {
    const c = productOgContent(
      { name: "X", images: [], priceMode: "ON_REQUEST", priceAmount: null, priceCurrency: "TRY", unit: "adet", moq: null, brand: null } as never,
      { name: "Y", city: null } as never,
    );
    expect(c.facts).toEqual(["Fiyat için teklif isteyin"]);
    expect(c.image).toBeNull();
    expect(c.subtitle).toBe("Y");
  });

  it("uzun başlık kelime sınırında kesilir", () => {
    const long = "Endüstriyel ".repeat(12).trim();
    const c = categoryOgContent(long, 5);
    expect(c.title.length).toBeLessThanOrEqual(90);
    expect(c.title.endsWith("…")).toBe(true);
    expect(cityOgContent("products", "İstanbul", 0).facts).toEqual([]);
    expect(cityOgContent("companies", "İstanbul", 1234).facts).toEqual(["1.234 firma"]);
  });
});
