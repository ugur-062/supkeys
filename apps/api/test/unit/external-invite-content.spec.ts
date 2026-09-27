import { InviteContentBuilder } from "../../src/common/company/external-invite-content";

/**
 * Dış davet İÇERİĞİ (2026-09-27): alıcının dilinde, yalnız beyaz liste —
 * kategori, son tarih (İstanbul saati), teslim yeri (şehir + ülke), numara,
 * kalemler, aranan tedarikçi tipi, vitrindeyse herkese açık sayfa, davet eden
 * firmanın adı. Hedef fiyat/şartname/marka/adres satırı yükte YOK.
 */
function builder(inVitrine: boolean) {
  const prisma = {
    category: {
      findMany: jest.fn().mockResolvedValue([{ nameTr: "Baş koruma", nameEn: "Head protection", nameRu: "Защита головы" }]),
    },
    companyAddress: { findFirst: jest.fn().mockResolvedValue({ city: "İstanbul", country: "TR" }) },
    listing: { count: jest.fn().mockResolvedValue(inVitrine ? 1 : 0) },
  };
  return new InviteContentBuilder(prisma as never, "http://localhost:3000");
}

const listing = {
  id: "l1",
  title: "Baret alımı",
  number: "ROT-000042",
  status: "OPEN",
  closesAt: new Date("2026-10-04T22:30:00Z"),
  categoryIds: ["46181700"],
  companyId: "c1",
  deliveryAddressId: "a1",
  preferredActivities: ["MANUFACTURER"],
  company: { name: "ABC İnşaat" },
  items: [
    { name: "Baret", quantity: "1200.000", unit: "adet", unitCode: "PCE" },
    { name: "Eldiven", quantity: "300.000", unit: "çift", unitCode: "PAIR" },
  ],
  _count: { items: 9 },
} as never;

describe("InviteContentBuilder", () => {
  it("İngilizce: kategori, son tarih, teslim yeri, numara, kalemler, tip, herkese açık sayfa, davet eden", async () => {
    const data = await builder(true).content(listing, "en");
    expect(data.inviterName).toBe("ABC İnşaat");
    expect(data.categories).toEqual(["Head protection"]);
    expect(data.closesAt).toContain("October 5, 2026");
    expect(data.deliveryPlace).toBe(`Istanbul, ${new Intl.DisplayNames(["en"], { type: "region" }).of("TR")}`);
    expect(data.tenderNumber).toBe("ROT-000042");
    expect(data.itemCount).toBe(9);
    expect(data.items).toEqual([
      { name: "Baret", quantity: 1200, unitCode: "PCE", unit: "adet" },
      { name: "Eldiven", quantity: 300, unitCode: "PAIR", unit: "çift" },
    ]);
    expect(data.supplierTypes).toEqual(["MANUFACTURER"]);
    expect(data.publicUrl).toBe("http://localhost:3000/en/buying-requests/rot-000042-baret-alimi");
    const json = JSON.stringify(data);
    for (const banned of ["targetPrice", "specification", "brand", "addressLine", "terms", "paymentNote"]) {
      expect(json).not.toContain(banned);
    }
  });

  it("vitrinde değilse herkese açık bağlantı yok; Türkçe tarih", async () => {
    const data = await builder(false).content(listing, "tr");
    expect(data.publicUrl).toBeNull();
    expect(data.closesAt).toContain("5 Ekim 2026");
  });
});
