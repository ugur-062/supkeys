/**
 * Admin inceleme + müdahale (Faz 5) — ilan kapat/uzat/yeniden aç + sipariş
 * iptali + davet iptali. Guard'lar: yalnız-uzatma, kazandırılmış ilan
 * açılamaz, onaylı ödemeli sipariş iptal edilemez, yalnız PENDING davet.
 */
import { AdminInspectionService } from "../../src/modules/admin-companies/admin-inspection.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { parseSystemText } from "@rothern/shared";

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
  const listings = {
    notifyListingParticipants: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { pingListing: jest.fn(), pingOrder: jest.fn() };
  const seo = { listingChanged: jest.fn() };
  const service = new AdminInspectionService(
    prisma as never,
    audit,
    companies as never,
    realtime as never,
    listings as never,
    seo as never,
  );
  return { service, companies, listings, realtime, seo };
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

  it("müdahaleler davetli + teklifçilere de bildirilir; gerekçe katılımcıya gitmez (derin denetim MU-04)", async () => {
    const { service, listings, realtime } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const invited = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });
    await prisma.listingInvitation.create({
      data: {
        listingId: l.id,
        invitedCompanyId: invited.company.id,
        invitedById: co.user.id,
      },
    });

    await service.extendListing(l.id, FURTHER.toISOString(), "admin-1");
    expect(listings.notifyListingParticipants).toHaveBeenLastCalledWith(
      l.id,
      expect.objectContaining({
        bodyKey: "api.notifications.listings.closingChanged.body",
        params: expect.objectContaining({ direction: "extended" }),
        type: "listing_closing_changed",
      }),
    );
    // Realtime ping davetli firmanın odasına da gider.
    expect(realtime.pingListing).toHaveBeenLastCalledWith(
      l.id,
      expect.arrayContaining([co.company.id, invited.company.id]),
    );

    await service.closeListing(l.id, "şikayet: gizli ayrıntı", "admin-1");
    const closeCall = listings.notifyListingParticipants.mock.calls.at(-1)!;
    expect(closeCall[1].bodyKey).toBe(
      "api.notifications.listings.adminClosed.body",
    );
    expect(JSON.stringify(closeCall[1])).not.toContain("gizli");

    await service.reopenListing(l.id, FURTHER.toISOString(), "admin-1");
    expect(listings.notifyListingParticipants).toHaveBeenLastCalledWith(
      l.id,
      expect.objectContaining({
        bodyKey: "api.notifications.listings.adminReopened.body",
        params: expect.objectContaining({ closesAt: expect.anything() }),
      }),
    );
    expect(listings.notifyListingParticipants).toHaveBeenCalledTimes(3);
  });

  it("realtime ping düşse de müdahale başarılı döner ve bildirimler gider (derin denetim MU-04)", async () => {
    const { service, listings, companies, realtime } = rig();
    realtime.pingListing.mockImplementation(() => {
      throw new Error("realtime down");
    });
    const co = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });

    await expect(
      service.closeListing(l.id, "moderasyon", "admin-1"),
    ).resolves.toEqual({ ok: true });
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: l.id },
    });
    expect(after.status).toBe("CLOSED");
    expect(listings.notifyListingParticipants).toHaveBeenCalledTimes(1);
    expect(companies.notifyCompany).toHaveBeenCalledTimes(1);
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
    // Moderasyon kapatmasının gerekçesi (D-140: açılınca temizlenmeli).
    await prisma.listing.update({
      where: { id: l.id },
      data: { cancelReason: "şikayet üzerine kapatıldı" },
    });
    await service.reopenListing(l.id, FUTURE.toISOString(), "admin-1");
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: l.id },
    });
    expect(after.status).toBe("OPEN");
    expect(after.cancelReason).toBeNull();
    // D-205: admin müdahalesi firma kimliğiyle (tenantId) yazılır.
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.listing.reopened", entityId: l.id },
    });
    expect(log?.tenantId).toBe(co.company.id);

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

describe("derin denetim LU-03 — admin kapanış kuralları, SEO, kesme bayrağı", () => {
  it("extend/reopen: 2 yıllık üst sınır ve bidsOpenAt kuralı sahip tarafıyla aynı", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const tooFar = new Date(Date.now() + 3 * 365 * 86_400_000).toISOString();
    const open = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });
    await expect(service.extendListing(open.id, tooFar, "admin-1")).rejects.toThrow(/çok ileri/);

    // Embargolu talep: açılış FURTHER'dan sonra; açılıştan önceki kapanışla
    // yeniden açılamaz.
    const embargoed = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "CLOSED",
      closesAt: FUTURE,
    });
    await prisma.listing.update({
      where: { id: embargoed.id },
      data: { bidsOpenAt: new Date(FURTHER.getTime() + 86_400_000) },
    });
    await expect(
      service.reopenListing(embargoed.id, FURTHER.toISOString(), "admin-1"),
    ).rejects.toThrow(/açılış tarihinden sonra/);
    await expect(service.reopenListing(embargoed.id, tooFar, "admin-1")).rejects.toThrow(/çok ileri/);
    const still = await prisma.listing.findUniqueOrThrow({ where: { id: embargoed.id } });
    expect(still.status).toBe("CLOSED");
  });

  it("extend koşullu-atomik: okuma sonrası OPEN'dan çıkan talebe kapanış yazılmaz, bildirim gitmez", async () => {
    const { service, companies } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });
    // Yarışı taklit: requireListing OPEN okur, yazımdan önce cron IN_AWARD'a alır.
    const svc = service as unknown as { requireListing: (id: string) => Promise<unknown> };
    const orig = svc.requireListing.bind(service);
    svc.requireListing = async (id: string) => {
      const row = await orig(id);
      await prisma.listing.update({ where: { id }, data: { status: "IN_AWARD" } });
      return row;
    };
    await expect(service.extendListing(l.id, FURTHER.toISOString(), "admin-1")).rejects.toThrow(
      /AÇIK ilan/,
    );
    const after = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(after.closesAt!.getTime()).toBe(FUTURE.getTime());
    expect(companies.notifyCompany).not.toHaveBeenCalled();
  });

  it("kapat/uzat/yeniden aç herkese açık talep önbelleğini tazeler (seo.listingChanged)", async () => {
    const { service, seo } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });
    await service.extendListing(l.id, FURTHER.toISOString(), "admin-1");
    await service.closeListing(l.id, "moderasyon", "admin-1");
    await service.reopenListing(l.id, FURTHER.toISOString(), "admin-1");
    expect(seo.listingChanged).toHaveBeenCalledTimes(3);
    expect(seo.listingChanged).toHaveBeenCalledWith(l.id);
  });

  it("ilan/sipariş listesi 100'ü aşınca sessiz kesilmez: truncated bayrağı döner", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    const other = await makeCompanyWithUser(prisma, {});
    const base = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      closesAt: FUTURE,
    });
    const src = await prisma.listing.findUniqueOrThrow({ where: { id: base.id } });
    await prisma.listing.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        companyId: co.company.id,
        createdById: co.user.id,
        type: src.type,
        title: `Talep ${i}`,
        status: src.status,
        closesAt: FUTURE,
      })),
    });
    const listings = await service.listListings(co.company.id);
    expect(listings.items).toHaveLength(100);
    expect(listings.truncated).toBe(true);

    await prisma.companyOrder.createMany({
      data: Array.from({ length: 100 }, () => ({
        buyerCompanyId: co.company.id,
        sellerCompanyId: other.company.id,
        amount: 10,
        currency: "TRY" as const,
        status: "PENDING" as const,
      })),
    });
    const orders = await service.listOrders(co.company.id);
    expect(orders.items).toHaveLength(100);
    expect(orders.truncated).toBe(false);
    await makeOrder(co.company.id, other.company.id);
    expect((await service.listOrders(co.company.id)).truncated).toBe(true);
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
    // Kodlu saklanır (çok dillilik); firma ekranı okuyucunun dilinde çizer.
    expect(parseSystemText(after.cancelReason)).toEqual({ code: "ADMIN", text: "taraflar anlaşamadı, destek #42" });
    expect(companies.notifyCompany).toHaveBeenCalledTimes(2);
  });

  it("D-164: talep siparişsiz kalınca tavsiye YALNIZ alıcıya; satıcıya nötr metin", async () => {
    const { service, companies } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      closesAt: FUTURE,
    });
    const order = await prisma.companyOrder.create({
      data: {
        buyerCompanyId: buyer.company.id,
        sellerCompanyId: seller.company.id,
        listingId: l.id,
        number: "SIP-1",
        amount: 1000,
        currency: "TRY",
        status: "PENDING",
      },
    });
    await service.cancelOrder(order.id, "taraflar anlaşamadı, destek #43", "admin-1");
    const calls = companies.notifyCompany.mock.calls as [
      string,
      { bodyKey: string; paragraphKeys: (string | false)[] },
    ][];
    const toBuyer = calls.find(([id]) => id === buyer.company.id)![1];
    const toSeller = calls.find(([id]) => id === seller.company.id)![1];
    expect(toBuyer.bodyKey).toBe(
      "api.notifications.adminInspection.siparisIptalGovdeNumaraliSahipsiz",
    );
    expect(toBuyer.paragraphKeys).toContain(
      "api.notifications.adminInspection.siparisIptalSahipsizTalep",
    );
    expect(toSeller.bodyKey).toBe("api.notifications.adminInspection.siparisIptalNumarali");
    expect(toSeller.paragraphKeys.filter(Boolean)).toEqual([
      "api.notifications.adminInspection.siparisIptalNumarali",
    ]);
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

  it("D-183: olmayan bağlantı/referans daveti 404", async () => {
    const { service } = rig();
    const c1 = await service
      .revokeConnectionInvite("olmayan-id", "admin-1")
      .catch((e: unknown) => e);
    expect((c1 as { getStatus: () => number }).getStatus()).toBe(404);
    const c2 = await service
      .revokeReferralInvite("olmayan-id", "admin-1")
      .catch((e: unknown) => e);
    expect((c2 as { getStatus: () => number }).getStatus()).toBe(404);
  });

  it("D-182: maskEmails ile referans davet e-postaları maskeli döner", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    await prisma.companyReferralInvite.create({
      data: {
        inviterCompanyId: a.company.id,
        email: "ucuncu.kisi@tedarikci.com",
        invitedById: a.user.id,
      },
    });
    const full = await service.listConnections(a.company.id);
    expect(full.referralInvites[0]!.email).toBe("ucuncu.kisi@tedarikci.com");
    const masked = await service.listConnections(a.company.id, { maskEmails: true });
    expect(masked.referralInvites[0]!.email).toBe("u***@tedarikci.com");
  });

  it("referans daveti SİLİNMEZ, CANCELLED olur; kuyruktaki talep davetleri iptal, gönderilmişler kalır (derin denetim MU-04)", async () => {
    const { service } = rig();
    const buyer = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      closesAt: FUTURE,
    });
    const ref = await prisma.companyReferralInvite.create({
      data: {
        inviterCompanyId: buyer.company.id,
        email: "dis@tedarikci.com",
        invitedById: buyer.user.id,
      },
    });
    // Talep × adres tekil → gönderilmiş ve kuyruktaki davet AYRI taleplerde.
    const listing2 = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      closesAt: FUTURE,
    });
    const mkExt = (state: "SENT" | "QUEUED", listingId: string) =>
      prisma.externalListingInvite.create({
        data: {
          listingId,
          inviterCompanyId: buyer.company.id,
          referralInviteId: ref.id,
          email: "dis@tedarikci.com",
          locale: "tr",
          source: "MANUAL",
          state,
        },
      });
    const sent = await mkExt("SENT", listing.id);
    const queued = await mkExt("QUEUED", listing2.id);

    await service.revokeReferralInvite(ref.id, "admin-1");

    const after = await prisma.companyReferralInvite.findUnique({
      where: { id: ref.id },
    });
    expect(after?.status).toBe("CANCELLED");
    const s = await prisma.externalListingInvite.findUniqueOrThrow({
      where: { id: sent.id },
    });
    expect(s.state).toBe("SENT");
    const q = await prisma.externalListingInvite.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(q.state).toBe("CANCELLED");
    expect(q.cancelReason).toBe("REFERRAL_CANCELLED");
    // İkinci iptal: artık PENDING değil → reddedilir.
    await expect(
      service.revokeReferralInvite(ref.id, "admin-1"),
    ).rejects.toThrow(/BEKLEYEN|bekleyen/i);
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
        // İki taslak kaydı + tek gönderim: eşzamanlılık sayacı 3, revizyon 1.
        version: 3,
        submitCount: 1,
      },
    });
    const listings = await service.listListings(a.company.id);
    expect(listings.items[0]!.bidCount).toBe(1);
    expect(listings.truncated).toBe(false);
    const detail = await service.listingDetail(l.id);
    const bids = detail.bids as { amount: unknown; submitCount: number; bidderCompany: { id: string } }[];
    expect(bids).toHaveLength(1);
    expect(bids[0]!.submitCount).toBe(1);
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
