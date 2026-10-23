import { InviteContentBuilder } from "../../src/common/company/external-invite-content";

/**
 * Dış davet İÇERİĞİ (2026-09-27): alıcının dilinde, yalnız beyaz liste —
 * kategori, son tarih (İstanbul saati), teslim yeri (şehir + ülke), numara,
 * kalemler, aranan tedarikçi tipi, vitrindeyse herkese açık sayfa, davet eden
 * firmanın adı. Hedef fiyat/şartname/marka/adres satırı yükte YOK.
 */
/**
 * Katalog (test): 30xxxxxx ve 31xxxxxx görünür segmentte; 10 gizli SEGMENT; 46 görünür
 * segment ama 4610 ailesi ve 461825 sınıfı gizli (`HIDDEN_CATEGORY_PREFIXES`);
 * 46181700 (görünür sınıf) sıradan kategoridir.
 */
const CATALOG = [
  { id: "30191500", nameTr: "İskeleler", nameEn: "Scaffolding", nameRu: "Строительные леса" },
  { id: "31161500", nameTr: "Vidalar", nameEn: "Screws", nameRu: "Винты" },
  { id: "46181700", nameTr: "Baş koruma", nameEn: "Head protection", nameRu: "Защита головы" },
  { id: "46101500", nameTr: "Ateşli silahlar", nameEn: "Firearms", nameRu: "Огнестрельное оружие" },
  { id: "46182501", nameTr: "Biber gazı spreyleri", nameEn: "Pepper sprays", nameRu: "Перцовые баллончики" },
  { id: "10101500", nameTr: "Çiftlik hayvanları", nameEn: "Livestock", nameRu: "Домашний скот" },
];
const HIDDEN_TEXT = [
  "Ateşli silahlar",
  "Firearms",
  "Огнестрельное оружие",
  "Biber gazı spreyleri",
  "Pepper sprays",
  "Перцовые баллончики",
  "Çiftlik hayvanları",
  "Livestock",
  "Домашний скот",
  "46101500",
  "46182501",
  "10101500",
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
   * GİZLİ DAL (2026-10-09, kullanıcı: "anasayfada olmayan kategori talepte,
   * üründe ya da başka yerde de gösterilmesin"). Davet e-postası, hatırlatması
   * ve kayıtsız önizleme sayfası aynı içeriği okur: dal gizlenmeden önce
   * açılmış talebin gizli kategorisi kayıtsız alıcıya ADIYLA gitmez; talep ve
   * görünür kategorileri aynen gider. 2026-10-10: gizli AİLE (4610) ve gizli
   * SINIF (461825) gizli segmentle aynı davranır; 46181700 sıradan kategoridir.
   */
  describe("gizli daldaki kategori davete yazılmaz", () => {
    const legacy = (categoryIds: string[]) => ({ ...(listing as object), categoryIds }) as never;

    it("eski talep (gizli aile + gizli sınıf + gizli segment + görünür): yalnız görünür kategorilerin adı; gizli kod kırpmada yer kapmaz", async () => {
      // İlk üç kod gizli: eski kırpma (ilk 3) görünür kodların hepsini düşürürdü.
      const { builder: b, findMany } = rig(true);
      const mixed = legacy(["46101500", "10101500", "46182501", "31161500", "30191500"]);
      for (const locale of ["tr", "en", "ru"] as const) {
        const data = await b.content(mixed, locale);
        expect([...data.categories].sort()).toEqual(
          { tr: ["Vidalar", "İskeleler"], en: ["Scaffolding", "Screws"], ru: ["Винты", "Строительные леса"] }[locale],
        );
        const json = JSON.stringify(data);
        for (const hidden of HIDDEN_TEXT) expect(json).not.toContain(hidden);
      }
      // Sorguya gizli kod hiç gitmedi ve sorgunun kendisi de süzüyor (iki hat).
      const where = findMany.mock.calls[0]![0].where;
      expect(where.id.in).toEqual(["31161500", "30191500"]);
      expect(where.NOT).toEqual(
        expect.arrayContaining([{ id: { startsWith: "4610" } }, { id: { startsWith: "461825" } }, { id: { startsWith: "10" } }]),
      );
      // 46 segmentinin TAMAMI süzülmez: görünür dalları davete girer.
      expect(where.NOT).not.toContainEqual({ id: { startsWith: "46" } });
    });

    it.each([
      ["gizli aile", "46101500"],
      ["gizli sınıf", "46182501"],
      ["gizli segment", "10101500"],
    ])("yalnız %s kategorili eski talep: kategori satırı boş, davetin geri kalanı aynen", async (_level, code) => {
      const { builder: b, findMany } = rig(true);
      const data = await b.content(legacy([code]), "en");
      expect(data.categories).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
      expect(data.tenderTitle).toBe("Baret alımı");
      expect(data.tenderNumber).toBe("ROT-000042");
      expect(data.itemCount).toBe(9);
      expect(data.publicUrl).toBe("http://localhost:3000/en/buying-requests/rot-000042-baret-alimi");
    });

    it("46 altındaki görünür sınıf davete adıyla yazılır (sıradan kategori), yanındaki gizli aile yazılmaz", async () => {
      const { builder: b } = rig(true);
      const data = await b.content(legacy(["46101500", "46181700"]), "en");
      expect(data.categories).toEqual(["Head protection"]);
      expect((await b.content(legacy(["46181700"]), "tr")).categories).toEqual(["Baş koruma"]);
    });
  });
});
