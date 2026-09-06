import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ibanChecksumOk, isValidIbanTr } from "@rothern/shared";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { ShipOrderDto } from "../../src/modules/company-orders/dto/order-action.dto";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { anyPackageWhere } from "../../src/common/company/effective-tier";

/**
 * AdminCompaniesService rig'i — GERÇEK constructor sırası:
 * (prisma, storage, email, notifications, config, audit, suppression).
 * Elle yazınca sıra kaymış ve `audit` yerine e-posta stub'ı geçmişti; hata
 * ancak audit'e ULAŞAN bir testte ortaya çıktı (rig stub gotcha).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAdminCompaniesService(Ctor: any): any {
  return new Ctor(
    prisma,
    { deleteObject: jest.fn().mockResolvedValue(undefined) },
    { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) },
    { pushToCompany: jest.fn().mockResolvedValue(1) },
    { get: jest.fn() },
    { log: jest.fn() },
    { isSuppressed: jest.fn().mockResolvedValue(false) },
  );
}


/**
 * Denetim Dalga B — 1. dalga (sessizce yanlış sonuç üreten maddeler).
 * Kaynak: Parça 3/7/8/11 Dalga B listeleri.
 */
describe("Denetim Dalga B-1", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("P3 — DTO trim", () => {
    it("yalnız boşluktan oluşan fatura numarası REDDEDİLİR", async () => {
      const dto = plainToInstance(ShipOrderDto, { invoiceNumber: "   " });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("invoiceNumber");
    });

    it("baştaki/sondaki boşluk kırpılır, değer korunur", async () => {
      const dto = plainToInstance(ShipOrderDto, {
        invoiceNumber: "  FTR-2026-001  ",
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.invoiceNumber).toBe("FTR-2026-001");
    });
  });

  describe("P3 — yabancı IBAN mod-97", () => {
    // Kaynak: ISO 13616 örnek IBAN'ları.
    const VALID_DE = "DE89370400440532013000";
    const VALID_GB = "GB29NWBK60161331926819";

    it("geçerli yabancı IBAN kabul edilir", () => {
      expect(ibanChecksumOk(VALID_DE)).toBe(true);
      expect(ibanChecksumOk(VALID_GB)).toBe(true);
    });

    it("TEK HANESİ değişmiş yabancı IBAN artık reddedilir (eskiden geçiyordu)", () => {
      // Eski kapı yalnız /^[A-Z]{2}[0-9A-Z]{8,32}$/ bakıyordu → bu da geçerdi.
      const typo = "DE89370400440532013001";
      expect(/^[A-Z]{2}[0-9A-Z]{8,32}$/.test(typo)).toBe(true); // eski kapı: GEÇER
      expect(ibanChecksumOk(typo)).toBe(false); // yeni kapı: DURDURUR
    });

    it("iki hane yer değiştirmiş IBAN reddedilir", () => {
      expect(ibanChecksumOk("GB29NWBK60161331926891")).toBe(false);
    });

    it("TR yolu davranışını korur (mod-97 aynı algoritma)", () => {
      const tr = "TR330006100519786457841326";
      expect(isValidIbanTr(tr)).toBe(ibanChecksumOk(tr));
    });
  });

  describe("P7 — bildirim sayfalaması", () => {
    it("`before` imleciyle 30'dan eski bildirimlere ULAŞILABİLİR", async () => {
      const { company, user } = await makeCompanyWithUser(prisma);
      const base = new Date("2026-03-01T00:00:00.000Z");
      for (let i = 0; i < 45; i++) {
        await prisma.notification.create({
          data: {
            companyUserId: user.id,
            companyId: company.id,
            type: "order_status_changed",
            title: `Bildirim ${i}`,
            body: "x",
            createdAt: new Date(base.getTime() + i * 60_000),
          },
        });
      }
      const svc = new NotificationService(prisma as never);
      const page1 = await svc.listForUser(user.id, { take: 30 });
      expect(page1).toHaveLength(30);
      expect(page1[0]!.title).toBe("Bildirim 44"); // en yeni önce

      const last = page1[page1.length - 1]!;
      const page2 = await svc.listForUser(user.id, {
        take: 30,
        before: { createdAt: last.createdAt, id: last.id },
      });
      // Eskiden bu 15 satıra ulaşacak HİÇBİR yüzey yoktu.
      expect(page2).toHaveLength(15);
      expect(page2[page2.length - 1]!.title).toBe("Bildirim 0");
      // Sayfalar ayrık olmalı (eşit damgalarda id tie-break'i)
      const ids = new Set([...page1, ...page2].map((n) => n.id));
      expect(ids.size).toBe(45);
    });
  });

  describe("P3/P4/P7 — INV-TIER-1 driftı (AI keşfi)", () => {
    it("anyPackageWhere süresi DOLMUŞ paketliyi dışarıda bırakır", async () => {
      const now = new Date();
      const expired = await makeCompanyWithUser(prisma, { tier: "GOLD" });
      const live = await makeCompanyWithUser(prisma, { tier: "SILVER" });
      await prisma.company.update({
        where: { id: expired.company.id },
        data: { membershipEndAt: new Date(now.getTime() - 86_400_000) },
      });
      await prisma.company.update({
        where: { id: live.company.id },
        data: { membershipEndAt: new Date(now.getTime() + 86_400_000) },
      });
      const rows = await prisma.company.findMany({
        where: { ...anyPackageWhere(now) },
        select: { id: true },
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(live.company.id);
      // Ham `tier: { in: [...] }` filtresi bunu DAHİL ederdi.
      expect(ids).not.toContain(expired.company.id);
    });
  });
});

/** Dalga B-2 — tek-kaynak sözleşmeleri. */
describe("Denetim Dalga B-2", () => {
  it("derin bağlantılar tek kaynaktan üretilir", async () => {
    const { appRoutes } = await import(
      "../../src/common/company/app-routes"
    );
    const base = "https://www.rothern.com";
    expect(appRoutes.listing(base, "abc")).toBe(
      "https://www.rothern.com/company/ilan/abc",
    );
    expect(appRoutes.order(base, "o1")).toBe(
      "https://www.rothern.com/company/siparis/o1",
    );
    expect(appRoutes.approvals(base)).toBe(
      "https://www.rothern.com/company/onaylar",
    );
    expect(appRoutes.messagesWith(base, "c9")).toBe(
      "https://www.rothern.com/company/mesajlar?with=c9",
    );
  });

  it("tasarruf raporu tavana dayandığında `truncated` bildirir", async () => {
    // Sözleşme kontrolü: alan varlığı (500 ihale kurmak pahalı olurdu).
    const svcSrc = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "src/modules/company-reports/company-reports.service.ts",
        "utf8",
      ),
    );
    // `general` zaten bildiriyordu; `savings` eskiden SESSİZ kesiyordu.
    const savings = svcSrc.slice(svcSrc.indexOf("async savings("));
    expect(savings).toContain("MAX_REPORT_LISTINGS + 1");
    expect(savings).toContain("truncated,");
  });
});

/** Dalga B-3 — üyelik & rol kapıları. */
describe("Denetim Dalga B-3", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("SÜRESİZ üyelik uzatılamaz (uzatma onu KISALTIYORDU)", async () => {
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const { company } = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: company.id },
      data: { membershipEndAt: null }, // süresiz
    });
    const svc = makeAdminCompaniesService(AdminCompaniesService);
    await expect(
      svc.extendMembership(company.id, 12, "admin1"),
    ).rejects.toThrow(/süresiz/i);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { membershipEndAt: true },
    });
    // Eskiden buraya `now + 12 ay` yazılıyordu → süresiz üyelik BİTİŞLİ olurdu.
    expect(after.membershipEndAt).toBeNull();
  });

  it("gizli tedarikçi şablonu firmadaki BAŞKA kullanıcıya görünmez", async () => {
    const { CompanySupplierTemplatesService } = await import(
      "../../src/modules/company-supplier-templates/company-supplier-templates.service"
    );
    const { company, user } = await makeCompanyWithUser(prisma);
    const other = await prisma.companyUser.create({
      data: {
        companyId: company.id,
        email: `ikinci-${Date.now()}@demo.com`,
        firstName: "İkinci",
        lastName: "Kullanıcı",
        roles: ["SATIN_ALMACI"],
      },
    });
    await prisma.supplierTemplate.create({
      data: {
        companyId: company.id,
        name: "Gizli liste",
        isPublic: false,
        createdById: user.id,
        memberCompanyIds: [],
      },
    });
    const svc = new CompanySupplierTemplatesService(prisma as never);
    const mine = await svc.list(company.id, user.id);
    const theirs = await svc.list(company.id, other.id);
    expect(mine).toHaveLength(1);
    // Eskiden `isPublic` HİÇBİR sorguda uygulanmıyordu → burası da 1 dönerdi.
    expect(theirs).toHaveLength(0);
  });

  it("silinmiş üye şablonun üye SAYISINA dahil edilmez", async () => {
    const { CompanySupplierTemplatesService } = await import(
      "../../src/modules/company-supplier-templates/company-supplier-templates.service"
    );
    const { company, user } = await makeCompanyWithUser(prisma);
    const member = await makeCompanyWithUser(prisma);
    await prisma.supplierTemplate.create({
      data: {
        companyId: company.id,
        name: "Liste",
        isPublic: true,
        createdById: user.id,
        // biri gerçek, biri artık var olmayan id
        memberCompanyIds: [member.company.id, "silinmis-firma-id"],
      },
    });
    const svc = new CompanySupplierTemplatesService(prisma as never);
    const rows = await svc.list(company.id, user.id);
    // Ham dizi uzunluğu 2 derdi; detay 1 firma gösteriyordu (tutarsızlık).
    expect(rows[0]!.memberCount).toBe(1);
  });

  it("bozuk yüzde-kaçışlı görsel adresi 400 verir (500 DEĞİL)", async () => {
    const { assertOwnProfileImageUrl } = await import(
      "../../src/common/helpers/upload-validation"
    );
    expect(() =>
      assertOwnProfileImageUrl("https://cdn.rothern.com/public/%zz/x.png", {
        allowedHosts: ["cdn.rothern.com"],
        tenantPrefix: "public/c1/",
      }),
    ).toThrow(/Geçersiz görsel adresi|kendi profil deponuzdan/);
  });
});

/** Dalga B-5 — depolama & gizlilik. */
describe("Denetim Dalga B-5", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("CDN tabanı yoksa profil görseli commit'i REDDEDİLİR (ölü presigned URL saklanmaz)", async () => {
    const { CompanyProfileService } = await import(
      "../../src/modules/company-profile/company-profile.service"
    );
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const key = `test/tenant-profile/${company.id}/logo-x.webp`;
    const storage = {
      // R2_PUBLIC_BASE_URL yok → kalıcı URL üretilemiyor
      getPublicUrl: jest.fn().mockReturnValue(null),
      resolveImageUrl: jest
        .fn()
        .mockResolvedValue("https://r2.example/presigned?exp=900"),
      checkExists: jest
        .fn()
        .mockResolvedValue({ exists: true, size: 1000, contentType: "image/webp" }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      buildTenantProfileKey: jest.fn().mockReturnValue(key),
      buildTenantProfilePrefix: jest.fn().mockReturnValue(
        `test/tenant-profile/${company.id}/`,
      ),
      classifyKey: jest.fn().mockReturnValue("public"),
    };
    const svc = new CompanyProfileService(
      prisma as never,
      storage as never,
      { resolveLabels: jest.fn() } as never,
      { log: jest.fn() } as never,
    );
    await expect(
      svc.resolveUploadedImage(company.id, key),
    ).rejects.toThrow(/R2_PUBLIC_BASE_URL|yapılandırma/i);
    // Eskiden 15 dk ömürlü presigned URL dönüyor, istemci onu KALICI kaydediyordu.
    expect(storage.resolveImageUrl).not.toHaveBeenCalled();
    void user;
    void auth;
  });

  it("içe aktarma dosya tavanı base64 şişmesini hesaba katar", async () => {
    const { IMPORT_MAX_FILE_BYTES, ITEM_IMPORT_MAX_CSV_BYTES } = await import(
      "@rothern/shared"
    );
    // Sunucu gövde sınırı 5 MB; base64 4/3 şişirir → dosya tavanı 3,75 MB'ın altında olmalı.
    const BODY_LIMIT = 5 * 1024 * 1024;
    expect(IMPORT_MAX_FILE_BYTES * (4 / 3)).toBeLessThan(BODY_LIMIT);
    // CSV tavanı ayrı ve daha düşük kalmalı (ExcelJS heap patlaması).
    expect(ITEM_IMPORT_MAX_CSV_BYTES).toBeLessThan(IMPORT_MAX_FILE_BYTES);
  });
});

/** Dalga A2 — P12 #1/#2 (sert silme kapısı) ve #6 (eksik RLS policy'leri). */
describe("Denetim P12 A2", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("SİPARİŞSİZ ama TEKLİFLİ firma sert silinmez — anonimleştirilir", async () => {
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const buyer = await makeCompanyWithUser(prisma);
    const seller = await makeCompanyWithUser(prisma);
    const { makeListing, makeItem, makeBid } = await import("./factories");
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });

    const svc = makeAdminCompaniesService(AdminCompaniesService);
    // Tedarikçinin HİÇ siparişi yok — eski kapı burada SERT SİLERDİ ve
    // alıcının ihalesindeki teklif cascade ile yok olurdu.
    const res = await svc.deleteOrAnonymize(
      seller.company.id,
      "admin1",
      async () => undefined,
    );
    expect(res.mode).toBe("anonymized");

    // Alıcının ihale dosyası BOZULMADI:
    const bidsLeft = await prisma.listingBid.count({
      where: { listingId: listing.id },
    });
    expect(bidsLeft).toBe(1);
  });

  it("hiçbir izi olmayan firma hâlâ sert silinebilir (KVKK yolu kapanmadı)", async () => {
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const lonely = await makeCompanyWithUser(prisma);
    const svc = makeAdminCompaniesService(AdminCompaniesService);
    const res = await svc.deleteOrAnonymize(
      lonely.company.id,
      "admin1",
      async () => undefined,
    );
    expect(res.mode).toBe("deleted");
  });

  it("RLS backstop'ta artık boşluk yok — 2 tablo daha policy'li", async () => {
    const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_policies
       WHERE schemaname = current_schema()
         AND tablename IN ('order_revision_items','company_kyc_revisions')`,
    );
    const names = rows.map((r) => r.tablename).sort();
    expect(names).toEqual(["company_kyc_revisions", "order_revision_items"]);
  });
});
