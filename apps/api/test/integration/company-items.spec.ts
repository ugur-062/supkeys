import { Prisma } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem } from "./factories";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";

/**
 * Faz 2 — Kalem Kataloğu sözleşmesi.
 *
 * En kritik iki garanti:
 *  (A) Katalog ↔ ilan kalemi arasında FK YOK — KOPYALAMA. Katalogdaki bir
 *      düzeltme yayınlanmış ihaleyi GERİYE DÖNÜK DEĞİŞTİRMEMELİ.
 *  (B) Ters yön ("ihaleden kataloğa") mükerrer üretmemeli — katalog
 *      kendiliğinden dolarken kirlenmemeli.
 */
describe("Kalem Kataloğu", () => {
  const make = () =>
    new CompanyItemsService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never, // storage — bu spec görsel yoluna girmiyor
    );

  beforeEach(async () => {
    await truncateAll();
  });

  describe("A — kopyalama, canlı bağ YOK", () => {
    it("katalog kalemi düzenlenince YAYINLANMIŞ ihale kalemi DEĞİŞMEZ", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      const cat = await svc.create(auth, {
        name: "Çelik boru 2 inç",
        unit: "m",
        code: "BRU-200",
      });
      // Sihirbaz katalogdan KOPYALAR (FK kurmaz):
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      await makeItem(prisma, listing.id, {
        name: cat.name,
        unit: cat.unit,
        unitCode: cat.unitCode,
        quantity: new Prisma.Decimal(10),
      });
      // Katalogda ad düzeltilir:
      await svc.update(auth, cat.id, { name: "Çelik boru 2½ inç", unit: "m" });
      const li = await prisma.listingItem.findFirstOrThrow({
        where: { listingId: listing.id },
      });
      expect(li.name).toBe("Çelik boru 2 inç"); // ihale dosyası SABİT
    });

    it("katalog kalemi arşivlenince ihale kalemi silinmez", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      const cat = await svc.create(auth, { name: "Vana", unit: "adet" });
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      await makeItem(prisma, listing.id, { name: "Vana", unit: "adet" });
      await svc.setActive(auth, cat.id, false);
      expect(
        await prisma.listingItem.count({ where: { listingId: listing.id } }),
      ).toBe(1);
    });
  });

  describe("B — ters yön: ihaleden kataloğa", () => {
    it("kalemleri kataloğa alır, İKİNCİ çağrıda mükerrer ÜRETMEZ", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      await makeItem(prisma, listing.id, { name: "Rulman 6204", unit: "adet", lineNo: 1 });
      await makeItem(prisma, listing.id, { name: "Kayış A-42", unit: "adet", lineNo: 2 });

      const first = await svc.importFromListing(auth, listing.id);
      expect(first).toMatchObject({ added: 2, skipped: 0 });

      const second = await svc.importFromListing(auth, listing.id);
      expect(second).toMatchObject({ added: 0, skipped: 2 });
      expect(await prisma.companyItem.count({ where: { companyId: company.id } })).toBe(2);
    });

    it("205 kalemli ilan TEK basışta tamamen alınır; ikinci basış hepsini 'zaten var' sayar (arayüz testi D-248)", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      await prisma.listingItem.createMany({
        data: Array.from({ length: 205 }, (_, i) => ({
          listingId: listing.id,
          lineNo: i + 1,
          name: `Kalem ${i + 1}`,
          unit: "adet",
          quantity: new Prisma.Decimal(1),
        })),
      });

      const first = await svc.importFromListing(auth, listing.id);
      expect(first).toEqual({ added: 205, skipped: 0, truncated: 0 });

      const second = await svc.importFromListing(auth, listing.id);
      expect(second).toEqual({ added: 0, skipped: 205, truncated: 0 });
      expect(await prisma.companyItem.count({ where: { companyId: company.id } })).toBe(205);
    });

    it("katalogda olan kalemler tavandan YER TUTMAZ — tekilleştirme kesmeden önce", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      await prisma.listingItem.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({
          listingId: listing.id,
          lineNo: i + 1,
          name: `Parça ${i + 1}`,
          unit: "adet",
          quantity: new Prisma.Decimal(1),
        })),
      });
      await svc.create(auth, { name: "Parça 1", unit: "adet" });
      const r = await svc.importFromListing(auth, listing.id);
      expect(r).toEqual({ added: 2, skipped: 1, truncated: 0 });
    });

    it("BAŞKA firmanın ilanından içe aktarılamaz", async () => {
      const mine = await makeCompanyWithUser(prisma);
      const other = await makeCompanyWithUser(prisma);
      const listing = await makeListing(prisma, {
        companyId: other.company.id,
        createdById: other.user.id,
      });
      await makeItem(prisma, listing.id, { name: "Gizli kalem", unit: "adet" });
      await expect(
        make().importFromListing(mine.auth, listing.id),
      ).rejects.toThrow(/bulunamadı/i);
    });

    it("tanınmayan birim PCE'ye ZORLANMAZ (uydurma varsayılan yok)", async () => {
      const { company, user, auth } = await makeCompanyWithUser(prisma);
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      await makeItem(prisma, listing.id, { name: "Kumaş", unit: "bobin" });
      await make().importFromListing(auth, listing.id);
      const row = await prisma.companyItem.findFirstOrThrow({
        where: { companyId: company.id },
      });
      expect(row.unit).toBe("bobin");
      expect(row.unitCode).toBeNull();
    });
  });

  describe("birim davranışı — ilan kalemiyle AYNI kural", () => {
    it("tanınan birim koda ve katalog adına normalize edilir", async () => {
      const { auth } = await makeCompanyWithUser(prisma);
      const r = await make().create(auth, { name: "Tel", unit: "KİLO" });
      expect(r.unitCode).toBe("KG");
      expect(r.unit).toBe("kilogram");
    });

    it("tanınmayan birim ENGELLEMEZ, metin aynen korunur", async () => {
      const { auth } = await makeCompanyWithUser(prisma);
      const r = await make().create(auth, { name: "Kumaş", unit: "bobin" });
      expect(r.unitCode).toBeNull();
      expect(r.unit).toBe("bobin");
    });
  });

  describe("kapılar", () => {
    it("aynı stok kodu firma içinde tekil", async () => {
      const { auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      await svc.create(auth, { name: "A", unit: "adet", code: "STK-1" });
      await expect(
        svc.create(auth, { name: "B", unit: "adet", code: "STK-1" }),
      ).rejects.toThrow(/tekil/i);
    });

    it("kodsuz kalemler çakışmaz (NULL unique semantiği)", async () => {
      const { auth } = await makeCompanyWithUser(prisma);
      const svc = make();
      await svc.create(auth, { name: "A", unit: "adet" });
      await svc.create(auth, { name: "B", unit: "adet" });
      expect((await svc.list((await makeCompanyWithUser(prisma)).company.id)).total).toBe(0);
    });

    it("liste BAŞKA firmanın kalemlerini göstermez", async () => {
      const a = await makeCompanyWithUser(prisma);
      const b = await makeCompanyWithUser(prisma);
      await make().create(a.auth, { name: "A firması kalemi", unit: "adet" });
      const res = await make().list(b.company.id);
      expect(res.total).toBe(0);
    });

    it("arşivlenmiş kalem listede görünmez ama geri alınabilir", async () => {
      const { auth, company } = await makeCompanyWithUser(prisma);
      const svc = make();
      const r = await svc.create(auth, { name: "Eski", unit: "adet" });
      await svc.setActive(auth, r.id, false);
      expect((await svc.list(company.id)).total).toBe(0);
      await svc.setActive(auth, r.id, true);
      expect((await svc.list(company.id)).total).toBe(1);
    });

    it("markUsed sık kullanılanı üste taşır", async () => {
      const { auth, company } = await makeCompanyWithUser(prisma);
      const svc = make();
      const a = await svc.create(auth, { name: "Az kullanılan", unit: "adet" });
      const b = await svc.create(auth, { name: "Çok kullanılan", unit: "adet" });
      await svc.markUsed(company.id, [b.id, b.id]); // tekilleştirilir → +1
      await svc.markUsed(company.id, [b.id]);
      const res = await svc.list(company.id);
      expect(res.items[0]!.id).toBe(b.id);
      expect(res.items[1]!.id).toBe(a.id);
    });
  });
});

describe("vitrin sayaçları", () => {
  it("counts süzgeçten BAĞIMSIZ firma geneli yayında/taslak sayısı", async () => {
    // Pano "N yayında · M taslak" ile Ürünlerim sekme sayaçları aynı sayıyı
    // göstermeli; arama daraltınca değişseydi ürün "kayboldu" sanılırdı.
    const { auth, company } = await makeCompanyWithUser(prisma);
    const svc = new CompanyItemsService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
    );
    const a = await svc.create(auth, { name: "Yayında ürün", unit: "adet" });
    await svc.create(auth, { name: "Taslak ürün", unit: "adet" });
    const arch = await svc.create(auth, { name: "Arşiv", unit: "adet" });
    await svc.setActive(auth, arch.id, false);
    await prisma.companyItem.update({
      where: { id: a.id },
      data: { isPublic: true, publishedAt: new Date(), slug: "yayinda" },
    });

    const all = await svc.list(company.id);
    expect(all.counts).toEqual({ published: 1, draft: 1, pending: 0, rejected: 0, publishedInReview: 0 });
    // Satır vitrin özetini taşır (durum rozeti / küçük görsel için).
    expect(all.items.find((i) => i.id === a.id)?.isPublic).toBe(true);
    expect(all.items.find((i) => i.id === a.id)?.thumbnailUrl).toBeNull();

    const narrowed = await svc.list(company.id, { q: "Taslak" });
    expect(narrowed.items).toHaveLength(1);
    expect(narrowed.counts).toEqual({ published: 1, draft: 1, pending: 0, rejected: 0, publishedInReview: 0 });
  });
});

describe("arşiv görünümü", () => {
  it("archived=true YALNIZ arşivlenmişleri döndürür", async () => {
    const { auth, company } = await makeCompanyWithUser(prisma);
    const svc = new CompanyItemsService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never, // storage — bu spec görsel yoluna girmiyor
    );
    const a = await svc.create(auth, { name: "Aktif", unit: "adet" });
    const b = await svc.create(auth, { name: "Arşivlik", unit: "adet" });
    await svc.setActive(auth, b.id, false);

    const active = await svc.list(company.id);
    const arch = await svc.list(company.id, { archived: true });
    expect(active.items.map((i) => i.id)).toEqual([a.id]);
    // Bayrak desteklenmeseydi burası da aktifleri döndürür ve arşiv ekranı
    // sessizce YANLIŞ liste gösterirdi.
    expect(arch.items.map((i) => i.id)).toEqual([b.id]);
  });
});

describe("arşivle/geri al izni (derin denetim S066)", () => {
  // Satınalma portalındaki Kalem Kataloğu `templates:manage` ile yönetilir;
  // uç eskiden yalnız `sell:product:manage` istediği için Satın Almacı her
  // tıklamada 403 alıyordu. Vitrine dokunmuş ürün ise yalnız satış izniyle.
  const make = () =>
    new CompanyItemsService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
    );

  it("templates:manage'li (satış izni olmayan) kullanıcı katalog kalemini arşivler", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const svc = make();
    const r = await svc.create(auth, { name: "Conta", unit: "adet" });
    const buyer = { ...auth, isOwner: false, roles: ["SATIN_ALMACI"] } as typeof auth;
    await expect(svc.setActive(buyer, r.id, false)).resolves.toMatchObject({ isActive: false });
    await expect(svc.setActive(buyer, r.id, true)).resolves.toMatchObject({ isActive: true });
  });

  it("yayındaki vitrin ürününü satış izni olmayan kullanıcı arşivleyemez", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const svc = make();
    const r = await svc.create(auth, { name: "Vitrin ürünü", unit: "adet" });
    await prisma.companyItem.update({
      where: { id: r.id },
      data: { isPublic: true, reviewStatus: "APPROVED", publishedAt: new Date(), slug: "vitrin-urunu" },
    });
    const buyer = { ...auth, isOwner: false, roles: ["SATIN_ALMACI"] } as typeof auth;
    await expect(svc.setActive(buyer, r.id, false)).rejects.toBeInstanceOf(ForbiddenException);
    // Satış izni olan kullanıcı arşivleyebilir.
    await expect(svc.setActive(auth, r.id, false)).resolves.toMatchObject({ isActive: false });
  });
});

describe("kalem yazma izni (arayüz testi D-185, DN-12)", () => {
  const make = () =>
    new CompanyItemsService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
    );

  it("POST / ve PATCH :id şablon iznini (templates:manage) de kabul eder", () => {
    const proto = CompanyItemsController.prototype as unknown as Record<string, object>;
    for (const handler of ["create", "update"]) {
      expect(Reflect.getMetadata(COMPANY_PERMISSION_KEY, proto[handler]!)).toEqual([
        "sell:product:manage",
        "templates:manage",
      ]);
    }
    // Vitrin uçları yalnız satış izniyle.
    expect(Reflect.getMetadata(COMPANY_PERMISSION_KEY, proto.createProduct!)).toBe("sell:product:manage");
    expect(Reflect.getMetadata(COMPANY_PERMISSION_KEY, proto.updateShowcase!)).toBe("sell:product:manage");
  });

  it("satış izni olmayan şablon yetkilisi TASLAK kalemi düzenler, vitrin ürününü düzenleyemez", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const svc = make();
    const buyer = { ...auth, isOwner: false, roles: ["SATIN_ALMACI"] } as typeof auth;
    const draft = await svc.create(buyer, { name: "Conta", unit: "adet" });
    await expect(svc.update(buyer, draft.id, { name: "Conta 2", unit: "adet" })).resolves.toMatchObject({
      name: "Conta 2",
    });

    const shown = await svc.create(auth, { name: "Vitrin ürünü", unit: "adet" });
    await prisma.companyItem.update({
      where: { id: shown.id },
      data: { isPublic: true, reviewStatus: "APPROVED", publishedAt: new Date(), slug: "vitrin-urunu-2" },
    });
    await expect(svc.update(buyer, shown.id, { name: "Değişti", unit: "adet" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
