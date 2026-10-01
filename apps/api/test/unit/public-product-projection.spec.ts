import { toPublicProduct, type PublicProductRow } from "../../src/modules/public-profile/dto/public-product.projection";

/**
 * Arayüz testi D-192 / D-331 (kullanıcı kararı T-18): projeksiyon medyayı
 * satıcının EFEKTİF paketine göre süzer (Silver+), anonim yüzeyde belge
 * indirme adresini yazmaz. Panel ürün ucu (üye) adresi alır.
 */
function row(company: { tier: string; membershipEndAt: Date | null }): PublicProductRow {
  return {
    id: "x",
    slug: "urun",
    name: "Ürün",
    description: null,
    specification: null,
    brand: null,
    mpn: null,
    unit: "adet",
    unitCode: null,
    categoryId: null,
    images: [],
    priceAmount: null,
    priceTiers: null,
    priceCurrency: "TRY",
    moq: null,
    videoUrl: "https://youtu.be/dQw4w9WgXcQ",
    externalUrl: null,
    documents: [{ url: "https://cdn/x.pdf", title: "Katalog" }],
    keywords: [],
    attributes: null,
    priceMode: "ON_REQUEST",
    publishedAt: null,
    updatedAt: new Date(),
    company,
  } as unknown as PublicProductRow;
}

describe("toPublicProduct — medya kuralları", () => {
  it("Silver: üye (varsayılan) adresi alır, anonim yalnız adı", () => {
    const r = row({ tier: "SILVER", membershipEndAt: null });
    expect(toPublicProduct(r).documents).toEqual([{ url: "https://cdn/x.pdf", title: "Katalog" }]);
    expect(toPublicProduct(r, { anonymous: true }).documents).toEqual([{ title: "Katalog" }]);
    expect(toPublicProduct(r).videoUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("STANDART ve süresi dolmuş Gold: video ve belge null (her yüzeyde)", () => {
    for (const c of [
      { tier: "STANDART", membershipEndAt: null },
      { tier: "GOLD", membershipEndAt: new Date(Date.now() - 1000) },
    ]) {
      const p = toPublicProduct(row(c));
      expect(p.videoUrl).toBeNull();
      expect(p.documents).toBeNull();
    }
  });

  it("yanıt satıcının paket bilgisini TAŞIMAZ", () => {
    const p = toPublicProduct(row({ tier: "GOLD", membershipEndAt: null })) as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty("company");
    expect(JSON.stringify(p)).not.toContain("GOLD");
  });
});
