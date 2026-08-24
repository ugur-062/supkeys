/**
 * Denetim 2026-08-23 Parça 4 (Çok-kiracılılık & yetki) — Dalga A regresyonları.
 * Rapor: docs/audit-2026-08-23-part4-tenancy.md
 */
import { CompanyRole, Prisma } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { CompanyBidDocumentsService } from "../../src/modules/company-bid-documents/company-bid-documents.service";
import { CompanyReviewsService } from "../../src/modules/company-reviews/company-reviews.service";
import { hasCompanyPermission } from "../../src/modules/company-auth/permissions/company-permissions.constants";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { connect, makeBid, makeCompanyWithUser, makeListing } from "./factories";
import { prisma, truncateAll } from "./test-db";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function withRoles(
  auth: AuthenticatedCompanyUser,
  roles: CompanyRole[],
  isOwner = false,
): AuthenticatedCompanyUser {
  return { ...auth, roles, isOwner } as AuthenticatedCompanyUser;
}

function docsService() {
  return new CompanyBidDocumentsService(prisma as never, {
    generatePresignedGet: jest.fn().mockResolvedValue("https://r2.test/get"),
    generatePresignedPut: jest.fn().mockResolvedValue("https://r2.test/put"),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    checkExists: jest.fn().mockResolvedValue({ exists: true, size: 10 }),
  } as never);
}

describe("#2 — teklif belgeleri: sahip GÖNDERİLMEMİŞ (DRAFT) teklifi görmez", () => {
  it("DRAFT teklifin belgesi sahibe dönmez; SUBMITTED olunca döner (teklifçi hep görür)", async () => {
    const svc = docsService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      status: "DRAFT",
    });
    await prisma.listingBidDocument.create({
      data: {
        bidId: bid.id,
        kind: "DIGER",
        fileName: "gizli-teklif-eki.pdf",
        mimeType: "application/pdf",
        key: "private/x.pdf",
        uploadedByCompanyId: bidder.company.id,
      } as never,
    });

    const ownerViewDraft = (await svc.list(owner.auth, listing.id)) as {
      fileName: string;
    }[];
    expect(ownerViewDraft).toHaveLength(0);

    // Teklifçi kendi taslağının belgesini görmeye devam eder (yükleme akışı).
    const bidderView = (await svc.list(bidder.auth, listing.id)) as unknown[];
    expect(bidderView).toHaveLength(1);

    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    const ownerViewSubmitted = (await svc.list(owner.auth, listing.id)) as {
      fileName: string;
    }[];
    expect(ownerViewSubmitted).toHaveLength(1);
    expect(ownerViewSubmitted[0]!.fileName).toBe("gizli-teklif-eki.pdf");
  });
});

describe("#3 — değerlendirme özeti ucu görünürlük kapısı", () => {
  async function target() {
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    return { viewer, seller, svc: new CompanyReviewsService(prisma as never) };
  }

  it("ilişkisiz + herkese-açık-olmayan firma → 404 (varlık sızmaz)", async () => {
    const { viewer, seller, svc } = await target();
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { publicEnabled: false },
    });
    await expect(
      svc.listForCompany(viewer.auth, seller.company.id),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("bağlantılı firma → özet döner; kendi firması her zaman açık", async () => {
    const { viewer, seller, svc } = await target();
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { publicEnabled: false },
    });
    await connect(
      prisma,
      viewer.company.id,
      seller.company.id,
      viewer.user.id,
    );
    await expect(
      svc.listForCompany(viewer.auth, seller.company.id),
    ).resolves.toBeDefined();
    await expect(
      svc.listForCompany(viewer.auth, viewer.company.id),
    ).resolves.toBeDefined();
  });
});

describe("#4 — izin override'ı KATALOGLA sınırlı", () => {
  it("katalog dışı (legacy) işlem anahtarı yetki VERMEZ; katalog içi verir; removed her zaman keser", () => {
    // Faz R: işlem izinleri (buy:*/sell:*) katalogdan ÇIKARILDI — override ile
    // verilemez. Rolsüz kullanıcıya legacy anahtar yazılmış olsa da etkisiz.
    expect(
      hasCompanyPermission([], false, "buy:listing:create", {
        added: ["buy:listing:create"],
      } as never),
    ).toBe(false);
    expect(
      hasCompanyPermission([], false, "buy:award", {
        added: ["buy:award"],
      } as never),
    ).toBe(false);
    // Katalog içi (yönetim/onay) anahtar — override çalışmaya devam eder.
    expect(
      hasCompanyPermission([], false, "users:manage", {
        added: ["users:manage"],
      } as never),
    ).toBe(true);
    // removed filtrelenmez (fail-closed): rolün verdiği izni de keser.
    expect(
      hasCompanyPermission([CompanyRole.SATIN_ALMACI], false, "buy:award", {
        removed: ["buy:award"],
      } as never),
    ).toBe(false);
  });
});

describe("#5 — KVKK dökümü: audit izi + kimlik-doğrulama iç durumu kapsam dışı", () => {
  it("export audit yazar, twoFactorSecret/authId/adminNotes döndürmez", async () => {
    const company = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.companyUser.update({
      where: { id: company.user.id },
      data: { twoFactorSecret: "sır", tokenVersion: 3 },
    });
    const svc = new AdminCompaniesService(
      prisma as never, // bypass client (testte RLS kapalı)
      {} as never, // storage
      { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      {} as never, // suppression
    );
    const out = (await svc.exportData(company.company.id, {
      id: "admin-1",
      email: "admin@rothern.com",
    })) as { company: Record<string, unknown> };

    const users = out.company.users as Record<string, unknown>[];
    expect(users[0]).not.toHaveProperty("twoFactorSecret");
    expect(users[0]).not.toHaveProperty("authId");
    expect(users[0]).not.toHaveProperty("tokenVersion");
    expect(out.company).not.toHaveProperty("adminNotes");

    let log: { action: string } | null = null;
    for (let i = 0; i < 20 && !log; i++) {
      log = await prisma.auditLog.findFirst({
        where: { action: "admin.company.exported" },
        select: { action: true },
      });
      if (!log) await new Promise((r) => setTimeout(r, 100));
    }
    expect(log).not.toBeNull();
  });
});

describe("#6 — pano geliri siparişin KENDİ para biriminden çevrilir", () => {
  it("TRY ilan + USD sipariş: gelir USD kuruyla hesaplanır", async () => {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: new Date(Date.now() - 3600_000),
      primaryCurrency: "TRY",
    } as never);
    await prisma.companyOrder.create({
      data: {
        listingId: listing.id,
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: new Prisma.Decimal(100),
        currency: "USD",
        status: "ACCEPTED",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });
    const { CompanyDashboardService } = await import(
      "../../src/modules/company-dashboard/company-dashboard.service"
    );
    const exchangeRate = {
      getRateOnDate: jest.fn().mockResolvedValue(40),
      getFreshRate: jest.fn().mockResolvedValue(40),
      getCurrentRate: jest.fn().mockResolvedValue(40),
    };
    const svc = new CompanyDashboardService(
      prisma as never,
      exchangeRate as never,
    );
    const res = (await svc.satisStats(seller.auth)) as {
      revenue: { total: number };
    };
    // 100 USD × 40 = 4000 ₺ (ilan TRY olduğu için eskiden 100 ₺ sayılıyordu).
    expect(res.revenue.total).toBe(4000);
    expect(exchangeRate.getRateOnDate).toHaveBeenCalledWith(
      "USD",
      expect.any(Date),
    );
  });
});
