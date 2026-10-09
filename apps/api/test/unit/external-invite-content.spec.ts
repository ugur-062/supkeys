import { InviteContentBuilder } from "../../src/common/company/external-invite-content";

/**
 * Dış davet İÇERİĞİ (2026-09-27): alıcının dilinde, yalnız beyaz liste —
 * kategori, son tarih (İstanbul saati), teslim yeri (şehir + ülke), numara,
 * kalemler, aranan tedarikçi tipi, vitrindeyse herkese açık sayfa, davet eden
 * firmanın adı. Hedef fiyat/şartname/marka/adres satırı yükte YOK.
 */
/** Katalog (test): 30 görünür segment; 46 ve 10 gizli (`HIDDEN_SEGMENTS`). */
const CATALOG = [
  { id: "30191500", nameTr: "İskeleler", nameEn: "Scaffolding", nameRu: "Строительные леса" },
  { id: "31161500", nameTr: "Vidalar", nameEn: "Screws", nameRu: "Винты" },
  { id: "46181700", nameTr: "Baş koruma", nameEn: "Head protection", nameRu: "Защита головы" },
  { id: "10101500", nameTr: "Çiftlik hayvanları", nameEn: "Livestock", nameRu: "Домашний скот" },
];

type CategoryWhere = { id: { in: string[] }; NOT?: { id: { startsWith: string } }[] };

/** Sahte Prisma `where`i GERÇEKTEN uygular (id IN + NOT startsWith) — süzgeç sorguda mı görülsün. */
function rig(inVitrine: boolean) {
  const findMany = jest.fn(async ({ where }: { where: CategoryWhere }) =>
    CATALOG.filter(
      (c) => where.id.in.includes(c.id) && !(where.NOT ?? []).some((n) => c.id.startsWith(n.id.startsWith)),
    ).map(({ id: _id, ...names }) => names),
  );
  const prisma = {
    category: { findMany },
    companyAddress: { findFirst: jest.fn().mockResolvedValue({ city: "İstanbul", country: "TR" }) },
    listing: { count: jest.fn().mockResolvedValue(inVitrine ? 1 : 0) },
  };
  return { builder: new InviteContentBuilder(prisma as never, "http://localhost:3000"), findMany };
}
const builder = (inVitrine: boolean) => rig(inVitrine).builder;

const listing = {
  id: "l1",
  title: "Baret alımı",
  number: "ROT-000042",
  status: "OPEN",
  closesAt: new Date("2026-10-04T22:30:00Z"),
  categoryIds: ["30191500"],
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
    expect(data.categories).toEqual(["Scaffolding"]);
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

  /**
   * GİZLİ SEGMENT (2026-10-09, kullanıcı: "anasayfada olmayan kategori talepte,
   * üründe ya da başka yerde de gösterilmesin"). Davet e-postası, hatırlatması
   * ve kayıtsız önizleme sayfası aynı içeriği okur: segment gizlenmeden önce
   * açılmış talebin gizli kategorisi kayıtsız alıcıya ADIYLA gitmez; talep ve
   * görünür kategorileri aynen gider.
   */
  describe("gizli segmentteki kategori davete yazılmaz", () => {
    const legacy = (categoryIds: string[]) => ({ ...(listing as object), categoryIds }) as never;

    it("eski talep (46 + 10 + görünür): yalnız görünür kategorilerin adı; gizli kod kırpmada yer kapmaz", async () => {
      // İlk üç kod gizli/gizli/görünür: eski kırpma (ilk 3) dördüncü görünür kodu düşürürdü.
      const { builder: b, findMany } = rig(true);
      const mixed = legacy(["46181700", "10101500", "31161500", "30191500"]);
      for (const locale of ["tr", "en", "ru"] as const) {
        const data = await b.content(mixed, locale);
        expect([...data.categories].sort()).toEqual(
          { tr: ["Vidalar", "İskeleler"], en: ["Scaffolding", "Screws"], ru: ["Винты", "Строительные леса"] }[locale],
        );
        const json = JSON.stringify(data);
        for (const hidden of ["Baş koruma", "Head protection", "Защита головы", "Çiftlik hayvanları", "Livestock", "Домашний скот", "46181700", "10101500"]) {
          expect(json).not.toContain(hidden);
        }
      }
      // Sorguya gizli kod hiç gitmedi ve sorgunun kendisi de süzüyor (iki hat).
      const where = findMany.mock.calls[0]![0].where;
      expect(where.id.in).toEqual(["31161500", "30191500"]);
      expect(where.NOT).toEqual(expect.arrayContaining([{ id: { startsWith: "46" } }, { id: { startsWith: "10" } }]));
    });

    it("yalnız gizli kategorili eski talep: kategori satırı boş, davetin geri kalanı aynen", async () => {
      const { builder: b, findMany } = rig(true);
      const data = await b.content(legacy(["46181700"]), "en");
      expect(data.categories).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
      expect(data.tenderTitle).toBe("Baret alımı");
      expect(data.tenderNumber).toBe("ROT-000042");
      expect(data.itemCount).toBe(9);
      expect(data.publicUrl).toBe("http://localhost:3000/en/buying-requests/rot-000042-baret-alimi");
    });
  });
});
