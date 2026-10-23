/**
 * Derin denetim LU-17 (DÜŞÜK) — raporlar, tedarikçi şablonları, İş Analizi.
 *  · Teklif karşılaştırmada "hedefe göre fark" yalnız hedefi olan VE teklifin
 *    fiyatladığı kalemler üzerinden (kısmi hedef toplamı tam teklif toplamıyla
 *    kıyaslanıyordu).
 *  · Gizli tedarikçi şablonu oluşturmayan üye tarafından güncellenemez/silinemez.
 *  · İş Analizi ortanca yanıt süresi "Hızlı yanıt veren" cron'uyla AYNI pencere.
 */
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { CompanyReportsService } from "../../src/modules/company-reports/company-reports.service";
import { CompanySupplierTemplatesService } from "../../src/modules/company-supplier-templates/company-supplier-templates.service";
import { CompanyViewsService } from "../../src/modules/company-views/company-views.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Teklif karşılaştırma — hedefe göre fark (X12)", () => {
  it("yalnız hedefli VE fiyatlanmış kalemler kıyaslanır; ortak kalem yoksa null", async () => {
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const full = await makeCompanyWithUser(prisma, { country: "TR" });
    const partial = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "IN_AWARD",
    });
    // Yalnız 1. kaleme hedef (100 TRY) girildi.
    const i1 = await makeItem(prisma, listing.id, { lineNo: 1, targetPrice: 100 } as never);
    const i2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const i3 = await makeItem(prisma, listing.id, { lineNo: 3 });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: full.company.id,
      createdById: full.user.id,
      amount: 1000,
      items: [
        { itemId: i1.id, unitPrice: 90 },
        { itemId: i2.id, unitPrice: 500 },
        { itemId: i3.id, unitPrice: 410 },
      ],
    });
    // Hedefli kalemi fiyatlamayan kısmi teklif.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: partial.company.id,
      createdById: partial.user.id,
      amount: 500,
      items: [{ itemId: i2.id, unitPrice: 500 }],
    });

    const r = await new CompanyReportsService(prisma as never).bidComparison(owner.company.id, {
      listingId: listing.id,
      criteria: "PRICE",
    });
    const pFull = r.parties.find((p) => p.companyId === full.company.id)!;
    const pPartial = r.parties.find((p) => p.companyId === partial.company.id)!;
    // Eskiden 100 − 1000 = −900 ("aşım").
    expect(pFull.deltaVsReference).toBe(10);
    // Eskiden 100 − 500 = −400; hedefli kalemi fiyatlamadığı için kıyas yok.
    expect(pPartial.deltaVsReference).toBeNull();
    expect(r.listing.referenceTotal).toBe(100);
  });
});

describe("Gizli tedarikçi şablonu — yazma yolları (S036)", () => {
  it("oluşturmayan üye gizli şablonu güncelleyemez/silemez (404); oluşturan yapabilir", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const other = await prisma.companyUser.create({
      data: {
        companyId: company.id,
        email: `lu17-${Date.now()}@demo.com`,
        firstName: "Diger",
        lastName: "Uye",
        roles: ["YONETICI"],
      },
    });
    const otherAuth = { ...auth, userId: other.id, isOwner: false };
    const tpl = await prisma.supplierTemplate.create({
      data: { companyId: company.id, name: "Gizli", isPublic: false, createdById: user.id, memberCompanyIds: [] },
    });
    const svc = new CompanySupplierTemplatesService(prisma as never);

    await expect(svc.update(otherAuth as never, tpl.id, { isPublic: true })).rejects.toThrow();
    await expect(svc.remove(otherAuth as never, tpl.id)).rejects.toThrow();
    const still = await prisma.supplierTemplate.findUniqueOrThrow({ where: { id: tpl.id } });
    expect(still.isPublic).toBe(false);

    await expect(svc.update(auth, tpl.id, { name: "Gizli 2" })).resolves.toEqual({ ok: true });
    // Herkese açık şablonu başka üye yine düzenleyebilir (yetkisi olan).
    await prisma.supplierTemplate.update({ where: { id: tpl.id }, data: { isPublic: true } });
    await expect(svc.update(otherAuth as never, tpl.id, { name: "Ortak" })).resolves.toEqual({ ok: true });
    await expect(svc.remove(otherAuth as never, tpl.id)).resolves.toEqual({ id: tpl.id });
  });
});

describe("İş Analizi ortanca yanıt süresi (S037)", () => {
  it("seçili dönemden bağımsız, cron'la AYNI 90 günlük pencere ve sayı", async () => {
    const me = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const item = await prisma.companyItem.create({
      data: { companyId: me.company.id, createdById: me.user.id, name: "Urun", unit: "adet" },
    });
    const ask = async (daysAgo: number, replyAfterH: number, tag: string) => {
      const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
      const inq = await prisma.publicInquiry.create({
        data: {
          companyId: me.company.id,
          productId: item.id,
          name: "Ali",
          email: `ali-${tag}@x.test`,
          message: "fiyat?",
          tokenHash: `h-lu17-${tag}`,
          expiresAt: new Date(Date.now() + 86_400_000),
          verifiedAt: createdAt,
          createdAt,
        },
      });
      await prisma.publicInquiryReply.create({
        data: { inquiryId: inq.id, authorId: me.user.id, body: "ok", createdAt: new Date(createdAt.getTime() + replyAfterH * 3_600_000) },
      });
    };
    await ask(3, 2, "yeni"); // 30 günlük dönemde, hızlı
    await ask(60, 30, "eski"); // dönem dışı ama 90 günlük pencerede, yavaş

    const svc = new CompanyViewsService(prisma as unknown as PrismaService);
    await svc.recomputeReplyTimes();
    const company = await prisma.company.findUniqueOrThrow({ where: { id: me.company.id }, select: { medianReplyHours: true } });
    const r = await svc.insights(me.auth, { days: 30 });

    // Eskiden 2 (yalnız dönemdeki talep) — dizindeki ölçü 30 iken.
    expect(r.inquiries.medianFirstReplyHours).toBe(company.medianReplyHours);
    expect(r.inquiries.medianFirstReplyHours).toBe(30);
    expect(r.inquiries.replyWindowDays).toBe(90);
    // Dönem sayıları dönemde kalır.
    expect(r.inquiries.received).toBe(1);
  });
});
