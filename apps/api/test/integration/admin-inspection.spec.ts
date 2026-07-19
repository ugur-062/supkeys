/**
 * Admin inceleme + müdahale (Faz 5) — ilan kapat/uzat/yeniden aç + sipariş
 * iptali + davet iptali. Guard'lar: yalnız-uzatma, kazandırılmış ilan
 * açılamaz, onaylı ödemeli sipariş iptal edilemez, yalnız PENDING davet.
 */
import { AdminInspectionService } from "../../src/modules/admin-companies/admin-inspection.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const FURTHER = new Date(Date.now() + 14 * 86_400_000);

function rig() {
  const companies = { notifyCompany: jest.fn().mockResolvedValue(undefined) };
  const audit = new AuditService(prisma as never);
  // RLS modeli: admin-inspection cross-tenant OKUR (ilan/sipariş/bağlantı birden
  // çok firmayı kapsar — inceleme doğası). Servis BYPASS client enjekte eder
  // (PrismaBypassService, RLS'siz owner rol). Testte owner test-db prisma =
  // bypass eşdeğeri → cross-tenant okumalar RLS-DOĞRU (admin bypass'a tabi, RLS
  // kısıtlamasına DEĞİL). Domain servisleri (listing/order/bid) asla bypass DEĞİL.
  const service = new AdminInspectionService(
    prisma as never,
    audit,
    companies as never,
    undefined, // realtime optional
  );
  return { service, companies };
}

async function makeOrder(
  buyerCompanyId: string,
  sellerCompanyId: string,
  status:
    | "PENDING"
    | "ACCEPTED"
    | "IN_DELIVERY"
    | "DELIVERED"
    | "COMPLETED" = "PENDING",
) {
  return prisma.companyOrder.create({
    data: {
      buyerCompanyId,
      sellerCompanyId,
      amount: 1000,
      currency: "TRY",
      status,
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("ilan müdahaleleri", () => {
  it("close: OPEN → CLOSED + gerekçe + sahip bildirimi + audit; OPEN değilse reddet", async () => {
    const { service, companies } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });
    await service.closeListing(l.id, "şikayet üzerine inceleme", "admin-1");
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: l.id },
    });
    expect(after.status).toBe("CLOSED");
    expect(after.cancelReason).toBe("şikayet üzerine inceleme");
    expect(companies.notifyCompany).toHaveBeenCalled();
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.listing.closed", entityId: l.id },
    });
    expect(log?.actorId).toBe("admin-1");
    // İkinci kapatma (artık CLOSED) reddedilir.
    await expect(
      service.closeListing(l.id, "tekrar kapatma denemesi", "admin-1"),
    ).rejects.toThrow(/AÇIK ilan/);
  });

  it("extend: yalnız UZATMA — kısaltma reddedilir; hatırlatma yeniden kurulur", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
      closingReminderSentAt: new Date(),
    });
    // Kısaltma (FUTURE'dan daha yakın) reddedilir.
    await expect(
      service.extendListing(
        l.id,
        new Date(Date.now() + 86_400_000).toISOString(),
        "admin-1",
      ),
    ).rejects.toThrow(/kısaltma/i);
    // Uzatma geçer + reminder damgası sıfırlanır.
    await service.extendListing(l.id, FURTHER.toISOString(), "admin-1");
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: l.id },
    });
    expect(after.closesAt!.getTime()).toBe(FURTHER.getTime());
    expect(after.closingReminderSentAt).toBeNull();
  });

  it("reopen: CLOSED+kazandırılmamış → OPEN; kazandırılmış reddedilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "CLOSED",
      closesAt: new Date(Date.now() - 86_400_000),
    });
    await service.reopenListing(l.id, FUTURE.toISOString(), "admin-1");
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: l.id },
    });
    expect(after.status).toBe("OPEN");

    // Kazandırılmış (awardedAt dolu) ilan yeniden açılamaz.
    const awarded = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "CLOSED",
      awardedAt: new Date(),
    });
    await expect(
      service.reopenListing(awarded.id, FUTURE.toISOString(), "admin-1"),
    ).rejects.toThrow(/Kazandırma/);
  });
});

describe("sipariş iptali", () => {
  it("PENDING sipariş iptal edilir; iki tarafa bildirim + audit", async () => {
    const { service, companies } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const order = await makeOrder(buyer.company.id, seller.company.id);
    await service.cancelOrder(order.id, "taraflar anlaşamadı, destek #42", "admin-1");
    const after = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toContain("[Yönetici]");
    expect(companies.notifyCompany).toHaveBeenCalledTimes(2);
  });

  it("onaylı ödemesi olan sipariş iptal EDİLEMEZ; DELIVERED da edilemez", async () => {
    const { service } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const order = await makeOrder(buyer.company.id, seller.company.id, "ACCEPTED");
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 500,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await expect(
      service.cancelOrder(order.id, "iptal denemesi gerekçesi", "admin-1"),
    ).rejects.toThrow(/Onaylı ödeme/);

    const delivered = await makeOrder(
      buyer.company.id,
      seller.company.id,
      "DELIVERED",
    );
    await expect(
      service.cancelOrder(delivered.id, "iptal denemesi gerekçesi", "admin-1"),
    ).rejects.toThrow(/bu durumda/);
  });
});

describe("davet iptalleri", () => {
  it("PENDING bağlantı daveti silinir; ACTIVE bağlantıya dokunulamaz", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    const pending = await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a.company.id,
        inviteeCompanyId: b.company.id,
        status: "PENDING",
        invitedById: a.user.id,
      },
    });
    await service.revokeConnectionInvite(pending.id, "admin-1");
    expect(
      await prisma.companyConnection.findUnique({ where: { id: pending.id } }),
    ).toBeNull();

    const c = await makeCompanyWithUser(prisma, {});
    const active = await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a.company.id,
        inviteeCompanyId: c.company.id,
        status: "ACTIVE",
        invitedById: a.user.id,
        decidedAt: new Date(),
      },
    });
    await expect(
      service.revokeConnectionInvite(active.id, "admin-1"),
    ).rejects.toThrow(/BEKLEYEN/);
  });

  it("listConnections yön + karşı-taraf doğru; inceleme listeleri döner", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a.company.id,
        inviteeCompanyId: b.company.id,
        status: "ACTIVE",
        invitedById: a.user.id,
        decidedAt: new Date(),
      },
    });
    const viewA = await service.listConnections(a.company.id);
    expect(viewA.connections[0]!.direction).toBe("outgoing");
    expect(viewA.connections[0]!.other.id).toBe(b.company.id);
    const viewB = await service.listConnections(b.company.id);
    expect(viewB.connections[0]!.direction).toBe("incoming");
    expect(viewB.connections[0]!.other.id).toBe(a.company.id);

    // İnceleme listeleri: ilan + sipariş + detay (kapalı-zarf admin görür).
    const l = await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      closesAt: FUTURE,
    });
    const bidder = await makeUser(prisma, b.company.id, ["SATISCI"]);
    await prisma.listingBid.create({
      data: {
        listingId: l.id,
        bidderCompanyId: b.company.id,
        amount: 750,
        currency: "TRY",
        status: "SUBMITTED",
        createdById: bidder.id,
        submittedAt: new Date(),
      },
    });
    const listings = await service.listListings(a.company.id);
    expect(listings[0]!.bidCount).toBe(1);
    const detail = await service.listingDetail(l.id);
    const bids = detail.bids as { amount: unknown; bidderCompany: { id: string } }[];
    expect(bids).toHaveLength(1);
    expect(Number(bids[0]!.amount)).toBe(750);
    expect(bids[0]!.bidderCompany.id).toBe(b.company.id);
  });
});

describe("F5: orderDetail onaylı-ödeme toplamı (Decimal, INV-MONEY-1)", () => {
  it("paymentConfirmed = onaylı ödemelerin Decimal toplamı; pending HARİÇ", async () => {
    const { service } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const order = await makeOrder(buyer.company.id, seller.company.id, "ACCEPTED");
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 333.33,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 333.34,
        status: "CONFIRMED",
        recordedByCompanyId: buyer.company.id,
        confirmedAt: new Date(),
      },
    });
    // Onaylanmamış → toplama GİRMEZ.
    await prisma.companyOrderPayment.create({
      data: {
        orderId: order.id,
        amount: 100,
        status: "AWAITING_CONFIRMATION",
        recordedByCompanyId: buyer.company.id,
      },
    });
    const detail = await service.orderDetail(order.id);
    expect(detail.paymentConfirmed).toBe("666.67"); // Decimal; 100 pending hariç
  });
});
