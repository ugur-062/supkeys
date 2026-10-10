import { tApi } from "../../src/common/i18n/i18n.service";
import { BadRequestException } from "@nestjs/common";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { AdminProductsService } from "../../src/modules/admin-companies/admin-products.service";

/**
 * Ürün moderasyonu — sözleşme: isPublic YALNIZ approve ile true olur;
 * yalnız PENDING karar alır; red yayındaki ürünü çeker; bildirim + audit +
 * SEO kancası çağrılır; koşullu updateMany yarışı yakalar.
 */
function rig(row: Record<string, unknown>) {
  const prisma = {
    companyItem: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({ submittedAt: new Date("2026-09-08T00:00:00Z") }),
    },
    category: { findMany: jest.fn().mockResolvedValue([{ id: "39000000", nameTr: "Elektrik" }]) },
    categoryAttribute: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const companies = { notifyCompany: jest.fn().mockResolvedValue(undefined) };
  const seo = { productChanged: jest.fn() };
  const svc = new AdminProductsService(prisma as never, audit as never, companies as never, seo as never);
  return { svc, prisma, audit, companies, seo };
}
const BASE = {
  id: "i1",
  name: "Dirsek",
  slug: "dirsek",
  code: null,
  // Yayın kapısından geçen içerik (arayüz testi O-009: onay da kapıyı denetler).
  description: "x".repeat(120),
  images: ["https://cdn/a.jpg"],
  keywords: ["dirsek"],
  attributes: { malzeme: "AISI 316" },
  brand: null,
  mpn: null,
  categoryId: "39000000",
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  videoUrl: null,
  externalUrl: null,
  documents: null,
  isPublic: false,
  isActive: true,
  publishedAt: null,
  reviewStatus: "PENDING",
  submittedAt: new Date("2026-09-09T00:00:00Z"),
  reviewedAt: null,
  reviewedByAdminId: null,
  rejectReason: null,
  completionScore: 70,
  createdAt: new Date(),
  updatedAt: new Date(),
  company: { id: "c1", name: "Acme", slug: "acme", city: "İzmir", country: "TR", tier: "SILVER", companyVerificationStatus: "VERIFIED", isBlocked: false },
};

describe("AdminProductsService", () => {
  it("approve: PENDING → APPROVED + isPublic + publishedAt; audit critical, bildirim, SEO", async () => {
    const { svc, prisma, audit, companies, seo } = rig(BASE);
    await svc.approve("i1", "admin1");
    const data = prisma.companyItem.updateMany.mock.calls[0][0].data;
    expect(prisma.companyItem.updateMany.mock.calls[0][0].where).toEqual({ id: "i1", reviewStatus: "PENDING" });
    expect(data).toMatchObject({ reviewStatus: "APPROVED", isPublic: true, reviewedByAdminId: "admin1", rejectReason: null });
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: "admin.product.approved", critical: true, tenantId: "c1" });
    // Metin ANAHTAR olarak geçer (alıcının diliyle üretilir); sözleşme Türkçe
    // karşılığın DEĞİŞMEMESİ — katalogdan çözüp eski dizeyle karşılaştırıyoruz.
    const approved = companies.notifyCompany.mock.calls[0][1];
    expect(tApi(approved.subjectKey)).toBe("Ürününüz yayına alındı");
    expect(tApi(approved.cta.labelKey)).toBe("Ürünü gör");
    expect(approved.cta.path).toBe("/firma/acme/urun/dirsek");
    expect(seo.productChanged).toHaveBeenCalledWith("i1");
  });

  it("approve yayındaki ürünün yeniden incelemesi: publishedAt korunur, başlık 'güncellemeniz onaylandı'", async () => {
    const pub = new Date("2026-08-01T00:00:00Z");
    const { svc, prisma, companies } = rig({ ...BASE, isPublic: true, publishedAt: pub });
    await svc.approve("i1", "admin1");
    expect(prisma.companyItem.updateMany.mock.calls[0][0].data.publishedAt).toBe(pub);
    expect(tApi(companies.notifyCompany.mock.calls[0][1].subjectKey)).toBe("Ürün güncellemeniz onaylandı");
  });

  it("reject: gerekçe yazılır, yayındaysa vitrinden çekilir ve SEO tazelenir; taslakta SEO çağrılmaz", async () => {
    const a = rig({ ...BASE, isPublic: true });
    await a.svc.reject("i1", "  Görseller ürüne ait değil  ", "admin1");
    expect(a.prisma.companyItem.updateMany.mock.calls[0][0].data).toMatchObject({ reviewStatus: "REJECTED", isPublic: false, rejectReason: "Görseller ürüne ait değil" });
    expect(a.seo.productChanged).toHaveBeenCalled();
    const rejected = a.companies.notifyCompany.mock.calls[0][1];
    expect(tApi(rejected.subjectKey)).toBe("Ürününüzde düzeltme istendi");
    expect(
      rejected.paragraphKeys.map((k: string) => tApi(k as never, rejected.params)).join(" "),
    ).toContain("vitrinden çekildi");

    const b = rig(BASE);
    await b.svc.reject("i1", "Açıklama yetersiz kalmış", "admin1");
    expect(b.seo.productChanged).not.toHaveBeenCalled();
    const draftRejected = b.companies.notifyCompany.mock.calls[0][1];
    expect(tApi(draftRejected.cta.labelKey)).toBe("Ürünü düzelt");
    expect(draftRejected.cta.path).toBe("/company/satis/urunlerim?sekme=rejected");
  });

  describe("paket ürün tavanı (derin denetim MU-13)", () => {
    // Ücretsiz dönem: tavan yalnız DOĞRULANMAMIŞ firmada vardır (doğrulanmış firma tam yetkili).
    const STD = {
      ...BASE,
      company: { ...BASE.company, tier: "STANDART", membershipEndAt: null, companyVerificationStatus: "UNVERIFIED" },
    };

    it("efektif STANDART firmada tavan doluyken vitrinde olmayan ürün onaylanmaz, PENDING kalır", async () => {
      const { svc, prisma, audit } = rig(STD);
      prisma.companyItem.count.mockResolvedValue(PRODUCT_LIMITS.STANDART);
      await expect(svc.approve("i1", "admin1")).rejects.toThrow(/tavanı dolu/);
      expect(prisma.companyItem.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      // Sayım ve yazma publish ile aynı firma kilidinde; kendisi hariç yalnız vitrindekiler sayılır.
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.companyItem.count.mock.calls[0][0].where).toEqual({
        companyId: "c1",
        isActive: true,
        isPublic: true,
        id: { not: "i1" },
      });
    });

    it("doğrulanmış firma saklı STANDART olsa da tavana takılmaz (ücretsiz dönem: sayım yapılmaz)", async () => {
      const { svc, prisma } = rig({ ...BASE, company: { ...STD.company, companyVerificationStatus: "VERIFIED" } });
      prisma.companyItem.count.mockResolvedValue(PRODUCT_LIMITS.STANDART);
      await svc.approve("i1", "admin1");
      expect(prisma.companyItem.count).not.toHaveBeenCalled();
      expect(prisma.companyItem.updateMany.mock.calls[0][0].data).toMatchObject({ isPublic: true });
    });

    it("süresi DOLMUŞ saklı Silver (doğrulanmamış firma) efektif STANDART sayılır", async () => {
      const expired = {
        ...BASE,
        company: {
          ...BASE.company,
          tier: "SILVER",
          membershipEndAt: new Date(Date.now() - 60_000),
          companyVerificationStatus: "UNVERIFIED",
        },
      };
      const { svc, prisma } = rig(expired);
      prisma.companyItem.count.mockResolvedValue(PRODUCT_LIMITS.STANDART);
      await expect(svc.approve("i1", "admin1")).rejects.toThrow(BadRequestException);
      expect(prisma.companyItem.updateMany).not.toHaveBeenCalled();
      // Ücretsiz dönem: metin paket anmaz; tavanın doğrulanmamış firmaya ait olduğunu söyler.
      await expect(svc.approve("i1", "admin1")).rejects.toThrow(/doğrulanmamış firmalar/i);
      await expect(svc.approve("i1", "admin1")).rejects.not.toThrow(/paket|silver|gold/i);
      const r = rig(expired);
      r.prisma.companyItem.count.mockResolvedValue(PRODUCT_LIMITS.STANDART);
      const out = await r.svc.approveMany(["i1"], "admin1");
      expect(out.skipped[0].reason).toMatch(/tavanı dolu/);
      expect(out.skipped[0].reason).not.toMatch(/paket|silver|gold/i);
    });

    it("liste/detay satırı efektif kademeyi ve üyelik bitişini döndürür (arayüz testi D-174)", async () => {
      const end = new Date(Date.now() - 86_400_000);
      // Doğrulanmamış + süresi dolmuş saklı paket → efektif STANDART.
      const { svc } = rig({
        ...BASE,
        company: { ...BASE.company, tier: "SILVER", membershipEndAt: end, companyVerificationStatus: "UNVERIFIED" },
      });
      const d = await svc.detail("i1");
      expect(d.company).toMatchObject({ tier: "SILVER", effectiveTier: "STANDART", membershipEndAt: end.toISOString() });
      // Doğrulanmamış + süresiz saklı paket → paketini korur.
      const kept = rig({ ...BASE, company: { ...BASE.company, companyVerificationStatus: "PENDING" } });
      const k = await kept.svc.list({ status: "PENDING" });
      expect(k.items[0].company).toMatchObject({ tier: "SILVER", effectiveTier: "SILVER", membershipEndAt: null });
      // Doğrulanmış firma (ücretsiz dönem) → saklı kademe ne olursa olsun efektif en üst kademe.
      const ok = rig(BASE);
      const l = await ok.svc.list({ status: "PENDING" });
      expect(l.items[0].company).toMatchObject({ tier: "SILVER", effectiveTier: "GOLD", membershipEndAt: null });
    });

    it("tavan altındaysa onaylanır; paketli kademede ve vitrindeki ürünün güncellemesinde sayım yapılmaz", async () => {
      const a = rig(STD);
      a.prisma.companyItem.count.mockResolvedValue(PRODUCT_LIMITS.STANDART! - 1);
      await a.svc.approve("i1", "admin1");
      expect(a.prisma.companyItem.updateMany.mock.calls[0][0].data).toMatchObject({ isPublic: true });

      const b = rig(BASE); // doğrulanmış (tam yetkili)
      await b.svc.approve("i1", "admin1");
      expect(b.prisma.companyItem.count).not.toHaveBeenCalled();

      const c = rig({ ...STD, isPublic: true, publishedAt: new Date("2026-09-01T00:00:00Z") });
      c.prisma.companyItem.count.mockResolvedValue(999);
      await c.svc.approve("i1", "admin1");
      expect(c.prisma.companyItem.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  it("yalnız PENDING karar alır; yarışta (count=0) 400", async () => {
    const { svc } = rig({ ...BASE, reviewStatus: "APPROVED" });
    await expect(svc.approve("i1", "a")).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reject("i1", "gerekçe gerekçe", "a")).rejects.toBeInstanceOf(BadRequestException);
    const race = rig(BASE);
    race.prisma.companyItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(race.svc.approve("i1", "a")).rejects.toThrow(/değişti/);
    expect(race.audit.log).not.toHaveBeenCalled();
  });

  it("YAYIN KAPISI ONAYDA DA (arayüz testi O-009): eksik içerikli ürün onaylanmaz, toplu onayda gerekçeyle atlanır", async () => {
    const eksik = { ...BASE, description: "Kısa.", keywords: [] };
    const tek = rig(eksik);
    await expect(tek.svc.approve("i1", "a")).rejects.toThrow(/yayın koşullarını karşılamıyor.*Açıklama.*anahtar kelime/);
    expect(tek.prisma.companyItem.updateMany).not.toHaveBeenCalled();
    expect(tek.audit.log).not.toHaveBeenCalled();

    const r = rig(BASE);
    r.prisma.companyItem.findUnique = jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "b" ? { ...eksik, id: "b" } : { ...BASE, id: where.id }),
    ) as never;
    const out = await r.svc.approveMany(["a", "b"], "adm1");
    expect(out.approved).toBe(1);
    expect(r.prisma.companyItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("detail: nitelikler etiketlenir, herkese açık adres kurulur; list kuyruğu en eski önce", async () => {
    const { svc, prisma } = rig(BASE);
    prisma.categoryAttribute.findMany.mockResolvedValue([{ groupKey: "malzeme", nameTr: "Malzeme", unit: null, sortOrder: 0, categoryId: "39000000", type: "TEXT", options: [], isRequired: false, id: "a1" }]);
    const d = await svc.detail("i1");
    expect(d.attributeList).toEqual([{ key: "malzeme", label: "Malzeme", value: "AISI 316", unit: null }]);
    expect(d.publicUrl).toBe("/firma/acme/urun/dirsek");
    expect(d.categoryName).toBe("Elektrik");
    await svc.list({ status: "PENDING" });
    expect(prisma.companyItem.findMany.mock.calls[0][0].orderBy[0]).toEqual({ submittedAt: "asc" });
    // D-216: KVKK ile anonimleşmiş firmanın ürünü kuyrukta yer almaz.
    expect(prisma.companyItem.findMany.mock.calls[0][0].where.company).toEqual({ isActive: true });
    const s = await svc.stats();
    expect(s.pending).toBe(1);
  });

  /**
   * HIDDEN SEGMENTS (owner rule 2026-10-09; audit F13 / F24). A category under
   * a hidden segment is shown nowhere - its name is not resolved in the review
   * queue either; the row says so with `hiddenCategory`. A product that is NOT
   * public yet cannot be approved with such a category (approval is the moment
   * a product goes public); the re-review of an ALREADY public legacy product
   * still works.
   */
  describe.each([
    ["gizli segment", "10101500"],
    // 2026-10-10: gizlemenin birimi kod önekidir — görünür segment 46'nın gizli dalları.
    ["görünür segmentin gizli ailesi", "46101500"],
    ["görünür ailenin gizli sınıfı", "46182501"],
  ])("gizli daldaki kategori (2026-10-09) — %s", (_level, HIDDEN_CODE) => {
    const LEGACY = { ...BASE, categoryId: HIDDEN_CODE };
    /** Catalogue mock that would name ANY code it is asked for. */
    function named(row: Record<string, unknown>) {
      const r = rig(row);
      r.prisma.category.findMany = jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, nameTr: `Ad ${id}` }))),
      ) as never;
      return r;
    }

    it("kuyruk ve detay: gizli kategorinin ADI çözülmez, `hiddenCategory` işaretlenir; görünür kategori eskisi gibi", async () => {
      const hidden = named(LEGACY);
      const list = await hidden.svc.list({ status: "PENDING" });
      expect(list.items[0]).toMatchObject({ categoryName: null, hiddenCategory: true });
      const detail = await hidden.svc.detail("i1");
      expect(detail).toMatchObject({ categoryName: null, hiddenCategory: true });
      expect(JSON.stringify([list, detail])).not.toContain(`Ad ${HIDDEN_CODE}`);
      // The hidden code is never sent to the name query.
      for (const call of (hidden.prisma.category.findMany as jest.Mock).mock.calls) {
        expect(call[0].where.id.in).not.toContain(HIDDEN_CODE);
      }

      const visible = named(BASE);
      const row = (await visible.svc.list({ status: "PENDING" })).items[0];
      expect(row).toMatchObject({ categoryName: "Ad 39000000", hiddenCategory: false });
    });

    it("vitrinde OLMAYAN ürün gizli kategoriyle onaylanmaz (tek ve toplu); metin güncel kategori ister", async () => {
      const tek = rig(LEGACY);
      await expect(tek.svc.approve("i1", "a")).rejects.toThrow(
        /yayın koşullarını karşılamıyor.*Kategori artık kullanılmıyor, güncel bir kategori seçilmeli/,
      );
      expect(tek.prisma.companyItem.updateMany).not.toHaveBeenCalled();
      expect(tek.audit.log).not.toHaveBeenCalled();

      const r = rig(BASE);
      r.prisma.companyItem.findUnique = jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === "b" ? { ...LEGACY, id: "b" } : { ...BASE, id: where.id }),
      ) as never;
      const out = await r.svc.approveMany(["a", "b"], "adm1");
      expect(out.approved).toBe(1);
      expect(out.skipped).toEqual([
        { id: "b", reason: expect.stringMatching(/Kategori artık kullanılmıyor/) },
      ]);
    });

    it("ZATEN vitrindeki eski ürünün güncelleme onayı engellenmez", async () => {
      const pub = new Date("2026-08-01T00:00:00Z");
      const { svc, prisma } = rig({ ...LEGACY, isPublic: true, publishedAt: pub });
      await svc.approve("i1", "admin1");
      expect(prisma.companyItem.updateMany.mock.calls[0][0].data).toMatchObject({
        reviewStatus: "APPROVED",
        isPublic: true,
        publishedAt: pub,
      });
    });
  });

  it("46 altındaki GÖRÜNÜR kategori sıradan kategoridir: adı çözülür, `hiddenCategory` false, vitrinde olmayan ürün onaylanır", async () => {
    const SAFETY = { ...BASE, categoryId: "46181500" };
    const r = rig(SAFETY);
    r.prisma.category.findMany = jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({ id, nameTr: `Ad ${id}` }))),
    ) as never;
    const row = (await r.svc.list({ status: "PENDING" })).items[0];
    expect(row).toMatchObject({ categoryName: "Ad 46181500", hiddenCategory: false });
    await r.svc.approve("i1", "admin1");
    expect(r.prisma.companyItem.updateMany.mock.calls[0][0].data).toMatchObject({ reviewStatus: "APPROVED", isPublic: true });
  });

  /**
   * TOPLU ONAY (2026-09-14) — otomatik onay DEĞİL: karar yine admin'in, 50
   * ürün için 50 tıklama 1'e iniyor (ücretsiz pakette ürün tavanı 50 oldu).
   */
  describe("approveMany", () => {
    /** Her id için AYRI satır döndüren rig — tek satırlık `rig` yetmez. */
    function coklu(rows: Record<string, unknown>[]) {
      const byId = new Map(rows.map((r) => [r.id as string, r]));
      const r = rig(rows[0]!);
      r.prisma.companyItem.findUnique = jest.fn(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(byId.get(where.id) ?? null),
      ) as never;
      return r;
    }

    it("çok ürünü onaylar; bildirim ÜRÜN başına değil FİRMA başına gider", async () => {
      const r = coklu([
        { ...BASE, id: "a", name: "Dirsek", slug: "dirsek" },
        { ...BASE, id: "b", name: "Flanş", slug: "flans" },
        { ...BASE, id: "c", name: "Küresel vana", slug: "kuresel-vana" },
      ]);
      const out = await r.svc.approveMany(["a", "b", "c"], "adm1");

      expect(out.approved).toBe(3);
      expect(out.skipped).toEqual([]);
      // Audit ve SEO ÜRÜN başına — ikisi de kayıt/indeks işi.
      expect(r.audit.log).toHaveBeenCalledTimes(3);
      expect(r.seo.productChanged).toHaveBeenCalledTimes(3);
      // 50 ürün onaylayıp firmaya 50 e-posta atmak spam olurdu.
      expect(r.companies.notifyCompany).toHaveBeenCalledTimes(1);
      const bulk = r.companies.notifyCompany.mock.calls[0][1];
      expect(tApi(bulk.subjectKey, bulk.params)).toBe("3 ürününüz yayına alındı");
    });

    it("iki firmanın ürünü → firma başına AYRI bildirim", async () => {
      const r = coklu([
        { ...BASE, id: "a" },
        { ...BASE, id: "b", company: { ...BASE.company, id: "c2", name: "Beta" } },
      ]);
      await r.svc.approveMany(["a", "b"], "adm1");
      expect(r.companies.notifyCompany).toHaveBeenCalledTimes(2);
      expect(
        r.companies.notifyCompany.mock.calls.map((c: unknown[]) => c[0]).sort(),
      ).toEqual(["c1", "c2"]);
    });

    it("bayat satır YIĞINI DÜŞÜRMEZ — atlanır ve gerekçesiyle döner", async () => {
      const r = coklu([
        { ...BASE, id: "a" },
        { ...BASE, id: "b", reviewStatus: "APPROVED" },
        { ...BASE, id: "c", slug: null },
      ]);
      const out = await r.svc.approveMany(["a", "b", "c"], "adm1");

      expect(out.approved).toBe(1);
      expect(out.skipped.map((x) => x.id).sort()).toEqual(["b", "c"]);
      expect(out.skipped.find((x) => x.id === "b")?.reason).toMatch(/Onay bekleyen/);
      expect(out.skipped.find((x) => x.id === "c")?.reason).toMatch(/slug/);
    });

    it("boş liste ve tavan aşımı reddedilir", async () => {
      const r = rig(BASE);
      await expect(r.svc.approveMany([], "adm1")).rejects.toThrow(BadRequestException);
      const cok = Array.from({ length: 101 }, (_, i) => `x${i}`);
      await expect(r.svc.approveMany(cok, "adm1")).rejects.toThrow(/en fazla 100/);
    });

    it("paket tavanı dolu (efektif STANDART) ürün ATLANIR, yığın düşmez (derin denetim MU-13)", async () => {
      const std = { ...BASE.company, tier: "STANDART", companyVerificationStatus: "UNVERIFIED" };
      const r = coklu([
        { ...BASE, id: "a", company: std },
        { ...BASE, id: "b", isPublic: true, company: std },
      ]);
      r.prisma.companyItem.count.mockResolvedValue(PRODUCT_LIMITS.STANDART);
      const out = await r.svc.approveMany(["a", "b"], "adm1");
      // "a" vitrinde değil → tavan dolu, atlanır; "b" zaten vitrinde → güncelleme onayı tavana dokunmaz.
      expect(out.approved).toBe(1);
      expect(out.skipped).toEqual([
        { id: "a", reason: expect.stringMatching(new RegExp(`tavanı dolu \\(${PRODUCT_LIMITS.STANDART}\\)`)) },
      ]);
      expect(r.prisma.companyItem.updateMany).toHaveBeenCalledTimes(1);
      expect(r.prisma.companyItem.updateMany.mock.calls[0][0].where).toEqual({ id: "b", reviewStatus: "PENDING" });
    });

    it("yinelenen id tavanı ve sayımı şişirmez", async () => {
      const r = coklu([{ ...BASE, id: "a" }]);
      const out = await r.svc.approveMany(["a", "a", "a"], "adm1");
      expect(out.approved).toBe(1);
      expect(r.companies.notifyCompany).toHaveBeenCalledTimes(1);
    });
  });
});
