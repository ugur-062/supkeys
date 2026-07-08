/**
 * Satış panosu — eski tedarikçi paneli paritesi (satisStats + satisAktivite).
 * Aktif davet / teklif / kazanım / sipariş sayaçları + gelir + aktivite akışı.
 */
import { CompanyDashboardService } from "../../src/modules/company-dashboard/company-dashboard.service";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeBid,
  makeCompanyWithUser,
  makeListing,
} from "./factories";

function makeDashboardService() {
  const exchangeRate = {
    getRateOnDate: jest.fn().mockResolvedValue(30),
    getCurrentRate: jest.fn().mockResolvedValue(30),
  };
  return new CompanyDashboardService(prisma as never, exchangeRate as never);
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("satisStats", () => {
  it("aktif davet: teklif verilmemiş OPEN ALIM davetleri sayılır; teklif verilen sayılmaz", async () => {
    const svc = makeDashboardService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });

    // Davet 1: teklif yok → aktif.
    const l1 = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
    });
    await invite(prisma, l1.id, seller.company.id, buyer.user.id);

    // Davet 2: SUBMITTED teklif var → aktif davet DEĞİL, aktif teklif.
    const l2 = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
    });
    await invite(prisma, l2.id, seller.company.id, buyer.user.id);
    await makeBid(prisma, {
      listingId: l2.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 1000,
    });

    const s = await svc.satisStats(seller.auth);
    expect(s.invitations.active).toBe(1);
    expect(s.bids.active).toBe(1);
  });

  it("kazanım + bekleyen sipariş + gelir (TRY) hesaplanır", async () => {
    const svc = makeDashboardService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });

    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      status: "AWARDED",
    });
    await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 5000,
      status: "WON",
    });
    await prisma.companyOrder.create({
      data: {
        listingId: l.id,
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 5000,
        status: "PENDING",
      },
    });
    // Reddedilen sipariş gelire dahil DEĞİL.
    await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 9999,
        status: "REJECTED",
      },
    });

    const s = await svc.satisStats(seller.auth);
    expect(s.wonTenders).toBe(1);
    expect(s.orders.pending).toBe(1);
    expect(s.revenue.total).toBe(5000); // TRY ilan → kur 1
    expect(s.revenue.last30).toBe(5000);
  });

  it("bağlı müşteri sayısı ACTIVE bağlantılardan gelir (iki yön)", async () => {
    const svc = makeDashboardService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const b1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const b2 = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, b1.company.id, seller.company.id, b1.user.id); // invitee=me
    await connect(prisma, seller.company.id, b2.company.id, seller.user.id); // inviter=me

    const s = await svc.satisStats(seller.auth);
    expect(s.buyers.active).toBe(2);
  });

  it("son 30 gün teklif sayısı: eski teklif prev pencerede sayılır", async () => {
    const svc = makeDashboardService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
    });
    const recent = await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 100,
    });
    void recent;
    // 45 gün önce verilmiş teklif — prev30 penceresi.
    const l2 = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
    });
    const old = await makeBid(prisma, {
      listingId: l2.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 100,
    });
    await prisma.listingBid.update({
      where: { id: old.id },
      data: { submittedAt: new Date(Date.now() - 45 * 86_400_000) },
    });

    const s = await svc.satisStats(seller.auth);
    expect(s.last30Days.bidsSubmitted).toBe(1);
    expect(s.last30Days.prevBidsSubmitted).toBe(1);
  });
});

describe("satisAktivite", () => {
  it("davet + teklif + sipariş birleşik, en yeni önce, limitli", async () => {
    const svc = makeDashboardService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      title: "Çelik Alımı",
    });
    await invite(prisma, l.id, seller.company.id, buyer.user.id);
    await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 100,
    });
    await prisma.companyOrder.create({
      data: {
        listingId: l.id,
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 100,
        status: "PENDING",
      },
    });

    const rows = await svc.satisAktivite(seller.auth, 8);
    expect(rows.length).toBe(3);
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(["bid", "invitation", "order"]);
    // En yeni önce sıralı.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].at.getTime()).toBeGreaterThanOrEqual(
        rows[i].at.getTime(),
      );
    }
    // Limit uygulanır.
    const limited = await svc.satisAktivite(seller.auth, 2);
    expect(limited.length).toBe(2);
  });
});

describe("satinalma — invitedPending (anasayfa uyarısı)", () => {
  it("teklif verilmemiş OPEN SATIŞ davetleri sayılır; teklif verilen ve ALIM sayılmaz", async () => {
    const svc = makeDashboardService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });

    // SATIŞ daveti, teklif yok → sayılır.
    const s1 = await makeListing(prisma, {
      companyId: seller.company.id,
      createdById: seller.user.id,
      type: "SATIS",
    });
    await invite(prisma, s1.id, buyer.company.id, seller.user.id);

    // SATIŞ daveti, teklif verilmiş → sayılmaz.
    const s2 = await makeListing(prisma, {
      companyId: seller.company.id,
      createdById: seller.user.id,
      type: "SATIS",
    });
    await invite(prisma, s2.id, buyer.company.id, seller.user.id);
    await makeBid(prisma, {
      listingId: s2.id,
      bidderCompanyId: buyer.company.id,
      createdById: buyer.user.id,
      amount: 1000,
    });

    // ALIM daveti → satınalma uyarısına GİRMEZ (o satış tarafına ait).
    const a1 = await makeListing(prisma, {
      companyId: seller.company.id,
      createdById: seller.user.id,
      type: "ALIM",
    });
    await invite(prisma, a1.id, buyer.company.id, seller.user.id);

    const d = await svc.satinalma(buyer.auth);
    expect(d.invitedPending).toBe(1);
  });
});
