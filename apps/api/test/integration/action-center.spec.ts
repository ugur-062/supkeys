/**
 * Aksiyon Merkezi (Faz 2) — sözleşme testleri.
 * Satırlar count>0 iken üretilir, severity + zaman alanları dolu gelir;
 * sıralama severity DESC → zaman; 0-teklif/kapanış kesişimi ayrık kümeler.
 */
import "reflect-metadata";
import { ActionCenterService } from "../../src/modules/company-dashboard/action-center.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

const DAY_MS = 86_400_000;

describe("ActionCenterService (DB)", () => {
  const service = new ActionCenterService(prisma as unknown as PrismaService);

  beforeEach(async () => {
    await truncateAll();
  });

  it("boş firma: iki portal da boş satır listesi döner (sahte satır yok)", async () => {
    const fx = await makeCompanyWithUser(prisma, {});
    expect((await service.satinalma(fx.company.id)).rows).toEqual([]);
    expect((await service.satis(fx.company.id)).rows).toEqual([]);
  });

  it("0 teklif + kapanışa <3 gün → zeroBidClosingSoon; teklifli olan closingSoon'a düşer", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    // Teklifsiz, yarın kapanan ihale.
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      closesAt: new Date(Date.now() + DAY_MS),
    });
    // Teklifli, yarın kapanan ihale.
    const withBid = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      closesAt: new Date(Date.now() + DAY_MS),
    });
    const item = await makeItem(prisma, withBid.id);
    await makeBid(prisma, {
      listingId: withBid.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      status: "SUBMITTED",
      amount: 500,
      submittedAt: new Date(),
      items: [{ itemId: item.id, unitPrice: 50 }],
    });

    const { rows } = await service.satinalma(buyer.company.id);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey.zeroBidClosingSoon?.count).toBe(1);
    expect(byKey.zeroBidClosingSoon?.dueAt).toBeTruthy();
    expect(byKey.closingSoon?.count).toBe(1);
    // Karar bekleyen teklif satırı da oluşur (SUBMITTED var).
    expect(byKey.awaitingDecision?.count).toBe(1);
    // Ayrık kümeler: teklifli ihale zeroBid satırında SAYILMAZ.
    expect(byKey.zeroBidClosingSoon?.count).not.toBe(2);
  });

  it("satış: teklifsiz açık davet unansweredInvites'a düşer, son gün kritik olur", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      closesAt: new Date(Date.now() + 12 * 3_600_000), // 12 saat kaldı
    });
    await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: seller.company.id,
        invitedById: buyer.user.id,
      },
    });

    const { rows } = await service.satis(seller.company.id);
    const invites = rows.find((r) => r.key === "unansweredInvites");
    expect(invites?.count).toBe(1);
    expect(invites?.severity).toBe("critical"); // son 24 saat
    expect(invites?.dueAt).toBeTruthy();

    // Teklif verilince satır kaybolur.
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      status: "SUBMITTED",
      amount: 100,
      submittedAt: new Date(),
      items: [{ itemId: item.id, unitPrice: 10 }],
    });
    const after = await service.satis(seller.company.id);
    expect(after.rows.find((r) => r.key === "unansweredInvites")).toBeUndefined();
  });

  it("satış: geçerliliği 3 gün içinde dolan SUBMITTED teklif expiringBids üretir", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "IN_AWARD",
    });
    const item = await makeItem(prisma, listing.id);
    // 10 gün önce gönderildi, 12 gün geçerli → 2 gün kaldı.
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      status: "SUBMITTED",
      amount: 100,
      submittedAt: new Date(Date.now() - 10 * DAY_MS),
      validityDays: 12,
      items: [{ itemId: item.id, unitPrice: 10 }],
    });

    const { rows } = await service.satis(seller.company.id);
    const expiring = rows.find((r) => r.key === "expiringBids");
    expect(expiring?.count).toBe(1);
    expect(expiring?.severity).toBe("warning");
    expect(expiring?.dueAt).toBeTruthy();
  });

  it("sıralama: critical satır warning'den önce gelir", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    // warning üretecek: teklifsiz yakın kapanış.
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      closesAt: new Date(Date.now() + DAY_MS),
    });
    // critical üretecek: teslim tarihi geçmiş sipariş.
    await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        amount: 1000,
        currency: "TRY",
        status: "IN_DELIVERY",
        expectedDeliveryDate: new Date(Date.now() - 3 * DAY_MS),
      },
    });

    const { rows } = await service.satinalma(buyer.company.id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.key).toBe("overdueDeliveries");
    expect(rows[0]!.severity).toBe("critical");
    expect(rows[0]!.overdueDays).toBe(3);
  });
});
