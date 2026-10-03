import { AuditService } from "../../src/modules/audit/audit.service";
import { runWithLocale } from "../../src/common/i18n/locale-context";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { ContentTranslationService } from "../../src/modules/content-translation/content-translation.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import { connect, makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

/**
 * BAŞKA FİRMANIN SEKTÖRÜ okuyucunun dilinde (yayın denetimi 2026-09-28 Bölüm 9).
 * EN ürün sayfasında satıcı kartı "Makine ve proses ekipmanı" basıyordu —
 * firmanın EN çevirisi ("Machinery and process equipment") DONE olduğu hâlde.
 * Aynı açık bağlantı listesi/önerileri ve sipariş karşı taraf profilindeydi.
 * Kural (CLAUDE.md): çapraz-firma okuma = localize* çağrısı.
 */
const bypass = prisma as unknown as PrismaBypassService;
const translations = () => new ContentTranslationService(bypass);

async function translatedCompany(over: Record<string, unknown> = {}) {
  const c = await makeCompanyWithUser(prisma, { country: "TR", ...over });
  await prisma.company.update({ where: { id: c.company.id }, data: { industry: "Makine ve proses ekipmanı" } });
  await prisma.contentTranslation.create({
    data: {
      entityType: "COMPANY",
      entityId: c.company.id,
      locale: "en",
      sourceLocale: "tr",
      sourceHash: "v3:test",
      status: "DONE",
      fields: { aboutText: null, services: [], industry: "Machinery and process equipment" },
    },
  });
  return c;
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("başka firmanın sektörü okuyucunun dilinde", () => {
  it("herkese açık ürün sayfası: satıcı kartı EN'de çevrili, TR'de özgün", async () => {
    const seller = await translatedCompany();
    await prisma.company.update({ where: { id: seller.company.id }, data: { publicEnabled: true, slug: "satici-sektor" } });
    await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "Redüktör",
        unit: "adet",
        slug: "reduktor",
        description: "x".repeat(120),
        images: ["a.webp"],
        keywords: ["reduktor"],
        isPublic: true,
        publishedAt: new Date(),
      },
    });
    const svc = new PublicProfileService(bypass, translations());
    const en = await runWithLocale("en", () => svc.getPublicProduct("satici-sektor", "reduktor"));
    expect(en.company.industry).toBe("Machinery and process equipment");
    expect(en.company).not.toHaveProperty("translatedFrom");
    const tr = await runWithLocale("tr", () => svc.getPublicProduct("satici-sektor", "reduktor"));
    expect(tr.company.industry).toBe("Makine ve proses ekipmanı");
  });

  it("bağlantı listesi: karşı firmanın sektörü EN'de çevrili", async () => {
    const me = await makeCompanyWithUser(prisma, { country: "TR", tier: "SILVER" });
    const other = await translatedCompany();
    await connect(prisma, me.company.id, other.company.id, me.user.id);
    const svc = new CompanyConnectionsService(
      prisma as never,
      bypass,
      { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
      { send: jest.fn() } as never,
      { get: jest.fn() } as never,
      { notify: jest.fn() } as never,
      new AuditService(prisma as never),
      undefined,
      translations(),
    );
    const list = await runWithLocale("en", () => svc.list(me.company.id));
    expect(list.map((l) => l.company.industry)).toEqual(["Machinery and process equipment"]);
  });

  it("sipariş detayı: karşı taraf profilinin sektörü EN'de çevrili", async () => {
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await translatedCompany();
    const order = await prisma.companyOrder.create({
      data: { sellerCompanyId: seller.company.id, buyerCompanyId: buyer.company.id, amount: 1000, status: "PENDING" },
    });
    const svc = new CompanyOrdersService(
      prisma as never,
      { send: jest.fn() } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new NotificationService(prisma as never),
      new AuditService(prisma as never),
      prisma as never,
      undefined,
      translations(),
    );
    const detail = await runWithLocale("en", () => svc.getOne(buyer.auth, order.id));
    expect(detail.counterpartyProfile.industry).toBe("Machinery and process equipment");
  });
});
