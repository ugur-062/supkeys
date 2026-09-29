/**
 * Derin denetim 2026-09-29 MU-20 — talep yaşam döngüsü:
 *  - doğrudan yayın (create asDraft:false) `company.listing.published` izi yazar;
 *  - düzenleme davetleri FARK olarak uygular: AI davetleri silinmez, yeni
 *    davetliye bildirim gider;
 *  - askıdaki firmanın talebi akıştan düşer / teklif almaz, askıdaki teklifçi
 *    kazandırılamaz;
 *  - RFQ "Yeni Tur" AUTO taşınan teklif turda bir kez revize edilebilir;
 *  - onay sonrası kazandırma (onAwardApproved) geçerliliği yeniden denetler;
 *  - açan kullanıcı çıkarılınca/pasifleşince yaşayan talepler devredilir.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
  makeUser,
} from "./factories";
import { makeService } from "./make-service";

const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 7 * DAY);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  let v = await fn();
  for (let i = 0; i < 40 && !ok(v); i++) {
    await new Promise((r) => setTimeout(r, 250));
    v = await fn();
  }
  return v;
}

describe("doğrudan yayın audit izi (S030)", () => {
  it("create(asDraft yok) → company.listing.published (from null → OPEN)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const l = await service.create(owner.auth, {
      type: "ALIM",
      format: "RFQ",
      visibility: "CONNECTIONS",
      title: "Doğrudan yayın izi",
      closesAt: FUTURE.toISOString(),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
      items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
    } as never);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.listing.published", entityId: l.id },
    });
    expect(row.metadata).toMatchObject({ from: null, to: "OPEN" });

    // Taslak oluşturma yayın izi YAZMAZ.
    const d = await service.create(owner.auth, {
      type: "ALIM",
      format: "RFQ",
      visibility: "CONNECTIONS",
      title: "Taslak",
      asDraft: true,
      items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
    } as never);
    expect(
      await prisma.auditLog.count({
        where: { action: "company.listing.published", entityId: d.id },
      }),
    ).toBe(0);
  });
});

describe("düzenleme davetleri fark olarak uygular (S030)", () => {
  async function setup() {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const aiMember = await makeCompanyWithUser(prisma, {});
    const kept = await makeCompanyWithUser(prisma, {});
    const added = await makeCompanyWithUser(prisma, {});
    for (const [c, rid] of [
      [aiMember, "AAAA-1111"],
      [kept, "KKKK-2222"],
      [added, "DDDD-3333"],
    ] as const) {
      await prisma.company.update({ where: { id: c.company.id }, data: { rothernId: rid } });
    }
    await connect(prisma, owner.company.id, kept.company.id, owner.user.id);
    await connect(prisma, owner.company.id, added.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      format: "RFQ",
      visibility: "PRIVATE",
      publishedAt: new Date(),
      openNotifiedAt: new Date(Date.now() - DAY),
      closesAt: FUTURE,
    });
    const aiInv = await prisma.listingInvitation.create({
      data: {
        listingId: listing.id,
        invitedCompanyId: aiMember.company.id,
        invitedById: owner.user.id,
        origin: "AI",
        aiReason: { productName: "M6 cıvata" },
      },
    });
    const keptInv = await prisma.listingInvitation.create({
      data: { listingId: listing.id, invitedCompanyId: kept.company.id, invitedById: owner.user.id },
    });
    const dto = (invitations: string[]) =>
      ({
        type: "ALIM",
        format: "RFQ",
        visibility: "PRIVATE",
        title: "Düzeltilmiş başlık",
        closesAt: FUTURE.toISOString(),
        items: [{ name: "M6 cıvata", quantity: 100, unit: "adet" }],
        invitations,
      }) as never;
    return { service, owner, aiMember, kept, added, listing, aiInv, keptInv, dto };
  }

  it("bağlantısız AI davetlisi (formda olsa da olmasa da) korunur; mevcut satır yeniden yazılmaz", async () => {
    const { service, owner, aiMember, kept, listing, aiInv, keptInv, dto } = await setup();
    // Form AI davetlisini geri gönderiyor (map-detail-to-form) — bağlantı şartına takılmaz.
    await service.updateListing(owner.auth, listing.id, dto(["AAAA-1111", "KKKK-2222"]));
    // Form AI davetlisini hiç göndermiyor — yine silinmez.
    await service.updateListing(owner.auth, listing.id, dto(["KKKK-2222"]));
    const rows = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { id: true, invitedCompanyId: true, origin: true, aiReason: true },
    });
    const ai = rows.find((r) => r.invitedCompanyId === aiMember.company.id);
    expect(ai).toMatchObject({ id: aiInv.id, origin: "AI", aiReason: { productName: "M6 cıvata" } });
    expect(rows.find((r) => r.invitedCompanyId === kept.company.id)?.id).toBe(keptInv.id);
    // AI davetlisi talebi hâlâ görür.
    await expect(service.getOne(aiMember.auth, listing.id)).resolves.toBeTruthy();
  });

  it("formdan çıkarılan elle davet silinir; yalnız AI davetlisi kalan özel talep düzenlenebilir", async () => {
    const { service, owner, aiMember, listing, dto } = await setup();
    await service.updateListing(owner.auth, listing.id, dto([]));
    const rows = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { invitedCompanyId: true },
    });
    expect(rows.map((r) => r.invitedCompanyId)).toEqual([aiMember.company.id]);
  });

  it("yayındaki talebe düzenlemede eklenen davetli bildirim alır; mevcut davetliye tekrar gitmez", async () => {
    const { service, owner, kept, added, listing, dto } = await setup();
    await service.updateListing(owner.auth, listing.id, dto(["KKKK-2222", "DDDD-3333"]));
    const notifs = await waitFor(
      () =>
        prisma.notification.findMany({
          where: { companyId: added.company.id, type: "listing_invitation" },
        }),
      (v) => v.length > 0,
    );
    expect(notifs.length).toBeGreaterThan(0);
    expect(
      await prisma.notification.count({
        where: { companyId: kept.company.id, type: "listing_invitation" },
      }),
    ).toBe(0);
  });
});

describe("askıdaki firma (X11)", () => {
  it("askıdaki alıcının açık talebi listede görünmez, detay 404, teklif 404", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      publishedAt: new Date(),
      closesAt: FUTURE,
    });
    const ids = async () =>
      ((await service.sellerTenders(seller.auth)) as Array<{ id: string }>).map((r) => r.id);
    expect(await ids()).toContain(listing.id);

    await prisma.company.update({ where: { id: owner.company.id }, data: { isBlocked: true } });
    expect(await ids()).not.toContain(listing.id);
    await expect(service.getOne(seller.auth, listing.id)).rejects.toThrow(/bulunamadı/);
    await expect(
      service.placeBid(seller.auth, listing.id, {
        amount: 100,
        deliveryTime: "W1_2",
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/bulunamadı/);
  });

  it("askıdaki teklifçiye kazandırma reddedilir (doğrudan ve onay sonrası)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "IN_AWARD",
      format: "RFQ",
      closesAt: new Date(Date.now() - 3600_000),
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 500,
      validityDays: 30,
    });
    await prisma.company.update({ where: { id: seller.company.id }, data: { isBlocked: true } });
    await expect(service.award(owner.auth, listing.id, bid.id)).rejects.toThrow(/askıda/);
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "IN_AWARD_APPROVAL" } });
    await expect(
      service.onAwardApproved({ listingId: listing.id, payload: { kind: "full", bidId: bid.id } }),
    ).rejects.toThrow(/askıda/);
    expect(await prisma.companyOrder.count({ where: { listingId: listing.id } })).toBe(0);
  });
});

describe("onay sonrası kazandırmada geçerlilik (X11/S032)", () => {
  async function expiredSetup() {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "IN_AWARD_APPROVAL",
      format: "RFQ",
      closesAt: new Date(Date.now() - DAY),
    });
    const item = await makeItem(prisma, listing.id);
    // 10 gün önce 3 gün geçerlilikle verildi → onay beklerken doldu.
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 500,
      submittedAt: new Date(Date.now() - 10 * DAY),
      validityDays: 3,
      items: [{ itemId: item.id, unitPrice: 500 }],
    });
    return { service, listing, item, bid };
  }

  it("tam kazandırma onayı süresi dolmuş teklife sipariş yazmaz", async () => {
    const { service, listing, bid } = await expiredSetup();
    await expect(
      service.onAwardApproved({ listingId: listing.id, payload: { kind: "full", bidId: bid.id } }),
    ).rejects.toThrow(/geçerlilik süresi dolmuş/);
    expect(await prisma.companyOrder.count({ where: { listingId: listing.id } })).toBe(0);
    expect((await prisma.listingBid.findUniqueOrThrow({ where: { id: bid.id } })).status).toBe("SUBMITTED");
  });

  it("kalem bazlı kazandırma onayı da süresi dolmuş teklife sipariş yazmaz", async () => {
    const { service, listing, item, bid } = await expiredSetup();
    await expect(
      service.onAwardApproved({
        listingId: listing.id,
        payload: { kind: "by-item", itemAwards: [{ itemId: item.id, bidId: bid.id }] },
      }),
    ).rejects.toThrow(/geçerlilik süresi dolmuş/);
    expect(await prisma.companyOrder.count({ where: { listingId: listing.id } })).toBe(0);
  });
});

describe("RFQ yeni turunda taşınan teklif (X11)", () => {
  it("AUTO taşınan teklif turda BİR KEZ revize edilir; ikinci gönderim ve taslağa çekme reddedilir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      publishedAt: new Date(),
      closesAt: FUTURE,
    });
    const offer = (amount: number, over: Record<string, unknown> = {}) =>
      ({ amount, deliveryTime: "W1_2", validityDays: 30, ...over }) as never;

    // Tur 1: gönderim kilitli (Mimari Karar 6).
    await service.placeBid(seller.auth, listing.id, offer(1000));
    await expect(service.placeBid(seller.auth, listing.id, offer(900))).rejects.toThrow(
      /Gönderilmiş teklif düzenlenemez/,
    );
    const first = (await service.getOne(seller.auth, listing.id)) as {
      myBid: { canReviseCarried: boolean };
    };
    expect(first.myBid.canReviseCarried).toBe(false);

    // Değerlendirmeye al → RFQ yeni tur (AUTO taşıma).
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "IN_AWARD" } });
    await service.createNextRound(owner.auth, listing.id, {
      type: "RFQ",
      carryBids: "AUTO",
      eliminateNonBidders: false,
      closesAt: FUTURE.toISOString(),
    } as never);
    const carried = (await service.getOne(seller.auth, listing.id)) as {
      myBid: { canReviseCarried: boolean; status: string };
    };
    expect(carried.myBid).toMatchObject({ status: "SUBMITTED", canReviseCarried: true });

    // Taşınan teklif taslağa çekilemez (yumuşak geri çekme olurdu).
    await expect(
      service.placeBid(seller.auth, listing.id, offer(800, { asDraft: true })),
    ).rejects.toThrow(/Gönderilmiş teklif düzenlenemez/);

    await service.placeBid(seller.auth, listing.id, offer(850));
    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: seller.company.id },
    });
    expect(Number(bid.amount)).toBe(850);
    expect(bid).toMatchObject({ status: "SUBMITTED", round: 2, activeBidRound: 2 });

    await expect(service.placeBid(seller.auth, listing.id, offer(800))).rejects.toThrow(
      /Gönderilmiş teklif düzenlenemez/,
    );
    const after = (await service.getOne(seller.auth, listing.id)) as {
      myBid: { canReviseCarried: boolean };
    };
    expect(after.myBid.canReviseCarried).toBe(false);
  });
});

describe("açan kullanıcı ayrılınca talep devri (X11)", () => {
  function makeUsersService() {
    return new CompanyUsersService(
      prisma as never,
      { createUser: jest.fn(), deleteUser: jest.fn().mockResolvedValue(undefined) } as never,
      { createSession: jest.fn() } as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      new NotificationService(prisma as never),
    );
  }
  const authOf = (
    u: { id: string; email: string },
    companyId: string,
    roles: CompanyRole[],
    isOwner = false,
  ) =>
    ({
      userId: u.id,
      companyId,
      email: u.email,
      roles,
      country: "TR",
      tier: "GOLD",
      isOwner,
      companyVerificationStatus: "VERIFIED",
    }) as never;

  it("çıkarılan satın almacının yaşayan talepleri çıkaran Kurucu'ya devredilir; Kurucu kazandırabilir", async () => {
    const users = makeUsersService();
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {});
    const buyer = await makeUser(prisma, owner.company.id, [CompanyRole.SATIN_ALMACI]);
    const seller = await makeCompanyWithUser(prisma, {});
    const inAward = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: buyer.id,
      status: "IN_AWARD",
      format: "RFQ",
      closesAt: new Date(Date.now() - 3600_000),
    });
    const awarded = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: buyer.id,
      status: "AWARDED",
      format: "RFQ",
    });
    const bid = await makeBid(prisma, {
      listingId: inAward.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 500,
      validityDays: 30,
    });

    // Devir öncesi Kurucu yönetemez (SAHİP istisnası yok).
    await expect(service.award(owner.auth, inAward.id, bid.id)).rejects.toThrow();

    await users.remove(owner.auth, buyer.id);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: inAward.id } })).createdById).toBe(
      owner.user.id,
    );
    // Kazandırılmış talep geçmiş kaydıdır — devredilmez.
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: awarded.id } })).createdById).toBe(
      buyer.id,
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.user.removed", entityId: buyer.id },
    });
    expect(audit.metadata).toMatchObject({ listingsTransferred: 1, listingsTransferredTo: owner.user.id });

    await service.award(owner.auth, inAward.id, bid.id);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: inAward.id } })).status).toBe("AWARDED");
  });

  it("pasifleştiren yöneticinin talep izni yoksa sorumluluk Kurucu'ya geçer", async () => {
    const users = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, {});
    const admin = await makeUser(prisma, owner.company.id, [CompanyRole.YONETICI]);
    const buyer = await makeUser(prisma, owner.company.id, [CompanyRole.SATIN_ALMACI]);
    const open = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: buyer.id,
      status: "OPEN",
      format: "RFQ",
      closesAt: FUTURE,
    });
    await users.setActive(authOf(admin, owner.company.id, [CompanyRole.YONETICI]), buyer.id, false);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: open.id } })).createdById).toBe(
      owner.user.id,
    );
  });
});
