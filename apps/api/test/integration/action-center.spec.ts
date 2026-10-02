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
import { makeService } from "./make-service";

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

  it("geri çekilen teklif 'teklifli' saymaz: talep zeroBidClosingSoon'a düşer (Taleplerim bidCount ile aynı küme, O-035)", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      closesAt: new Date(Date.now() + DAY_MS),
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      status: "WITHDRAWN",
      amount: 500,
      submittedAt: new Date(),
      items: [{ itemId: item.id, unitPrice: 50 }],
    });

    const { rows } = await service.satinalma(buyer.company.id);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.zeroBidClosingSoon?.count).toBe(1);
    expect(byKey.closingSoon).toBeUndefined();
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

  it("satış: yanıtsız DOĞRULANMIŞ bilgi talebi unansweredInquiries üretir; yanıtlanınca düşer", async () => {
    // Karşıda soru sormuş bir alıcı bekliyor — pano şeridinde görünmeli.
    // Doğrulanmamış satır satıcıya hiç iletilmedi, sayılmaz.
    const seller = await makeCompanyWithUser(prisma, {});
    const product = await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "Pano",
        unit: "adet",
        slug: "pano",
      },
    });
    const mk = (verified: boolean, tokenHash: string) =>
      prisma.publicInquiry.create({
        data: {
          companyId: seller.company.id,
          productId: product.id,
          name: "Ayşe",
          email: `a-${tokenHash}@example.com`,
          message: "Fiyat?",
          tokenHash,
          expiresAt: new Date(),
          verifiedAt: verified ? new Date(Date.now() - 2 * DAY_MS) : null,
        },
      });
    const answered = await mk(true, "t1");
    await mk(true, "t2");
    await mk(false, "t3");

    const { rows } = await service.satis(seller.company.id);
    const inq = rows.find((r) => r.key === "unansweredInquiries");
    expect(inq?.count).toBe(2);
    expect(inq?.severity).toBe("warning");
    expect(inq?.waitingDays).toBe(2);

    await prisma.publicInquiryReply.create({
      data: { inquiryId: answered.id, authorId: seller.user.id, body: "Stokta." },
    });
    const after = await service.satis(seller.company.id);
    expect(after.rows.find((r) => r.key === "unansweredInquiries")?.count).toBe(1);
  });

  it("satış: engel ilişkisindeki kayıtlı alıcının talebi unansweredInquiries'e girmez; misafir talebi girer (LU-18)", async () => {
    // Gelen kutusu engelli alıcının talebini gizliyor, yanıtı 404 dönüyor —
    // pano aynı talebi "yanıt bekliyor" diye sonsuza dek göstermemeli.
    const seller = await makeCompanyWithUser(prisma, {});
    const buyer = await makeCompanyWithUser(prisma, {});
    const product = await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "Pano",
        unit: "adet",
        slug: "pano-engel",
      },
    });
    const mk = (tokenHash: string, claimedCompanyId: string | null) =>
      prisma.publicInquiry.create({
        data: {
          companyId: seller.company.id,
          productId: product.id,
          claimedCompanyId,
          name: "Ayşe",
          email: `a-${tokenHash}@example.com`,
          message: "Fiyat?",
          tokenHash,
          expiresAt: new Date(),
          verifiedAt: new Date(Date.now() - 2 * DAY_MS),
        },
      });
    await mk("b1", buyer.company.id);
    await mk("g1", null);

    const before = await service.satis(seller.company.id);
    expect(before.rows.find((r) => r.key === "unansweredInquiries")?.count).toBe(2);

    // Alıcı satıcıyı engelliyor (yön fark etmez).
    await prisma.companyBlock.create({
      data: { blockerCompanyId: buyer.company.id, blockedCompanyId: seller.company.id },
    });
    const after = await service.satis(seller.company.id);
    expect(after.rows.find((r) => r.key === "unansweredInquiries")?.count).toBe(1);
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

  // Arayüz testi O-035 (son tur): ödeme satırları Siparişlerim
  // `?payment=overdue|open` ile aynı kümeyi saymalı — vade `paymentDueDate`
  // (vadeli kategori + teslim + gün), ödendi = tam Decimal (liste
  // `paymentSettled`). Eskiden kategorisiz vade + completedAt yedeği sayılıyordu.
  it("ödeme satırları liste kuralıyla: vadeli kategori + teslim + gün; tam ödenen ve vadesiz kategori gecikmiş sayılmaz", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const seller = await makeCompanyWithUser(prisma, {});
    const base = {
      buyerCompanyId: buyer.company.id,
      sellerCompanyId: seller.company.id,
      amount: 1000,
      currency: "TRY",
      paymentTiming: "AFTER_DELIVERY",
    } as const;
    const ago = (d: number) => new Date(Date.now() - d * DAY_MS);
    // 1) Vadesi geçmiş, ödenmemiş (DEFERRED, 10 gün önce teslim, 2 gün vade) → gecikmiş.
    await prisma.companyOrder.create({
      data: { ...base, status: "COMPLETED", paymentCategory: "DEFERRED", paymentDays: 2, deliveredAt: ago(10), completedAt: ago(10) } as never,
    });
    // 2) Vadesiz kategori (OPEN_ACCOUNT) ama paymentDays dolu → vade YOK → ödeme bekleniyor.
    await prisma.companyOrder.create({
      data: { ...base, status: "DELIVERED", paymentCategory: "OPEN_ACCOUNT", paymentDays: 2, deliveredAt: ago(10) } as never,
    });
    // 3) Vadesi geçmiş ama tam ödenmiş → hiçbir ödeme satırına girmez.
    const paid = await prisma.companyOrder.create({
      data: { ...base, status: "COMPLETED", paymentCategory: "DEFERRED", paymentDays: 2, deliveredAt: ago(10), completedAt: ago(10) } as never,
    });
    await prisma.companyOrderPayment.create({
      data: { orderId: paid.id, amount: 1000, status: "CONFIRMED", recordedByCompanyId: buyer.company.id },
    });
    // 4) Vadesi gelecekte → ödeme bekleniyor.
    await prisma.companyOrder.create({
      data: { ...base, status: "DELIVERED", paymentCategory: "DEFERRED", paymentDays: 30, deliveredAt: ago(1) } as never,
    });
    // 5) completedAt var, deliveredAt yok → vade hesaplanamaz (liste gibi) → bekleniyor.
    await prisma.companyOrder.create({
      data: { ...base, status: "COMPLETED", paymentCategory: "DEFERRED", paymentDays: 1, completedAt: ago(10) } as never,
    });

    const { rows } = await service.satinalma(buyer.company.id);
    expect(rows.find((r) => r.key === "overduePayments")?.count).toBe(1);
    expect(rows.find((r) => r.key === "overduePayments")?.overdueDays).toBe(8);
    expect(rows.find((r) => r.key === "paymentWindow")?.count).toBe(3);
  });

  it("AI önerisi satırı ile Taleplerim aiSuggestionsPending aynı talepleri işaretler (O-035)", async () => {
    const buyer = await makeCompanyWithUser(prisma, {});
    const mk = () =>
      makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        status: "OPEN",
        closesAt: new Date(Date.now() + 10 * DAY_MS),
      });
    const withSuggestion = await mk();
    const dismissed = await mk();
    const allInvited = await mk();
    await mk(); // keşif turu yok
    const run = (listingId: string, extra: object, status: string) =>
      prisma.supplierDiscoveryRun.create({
        data: {
          companyId: buyer.company.id,
          listingId,
          trigger: "PUBLISH",
          state: "DONE",
          finishedAt: new Date(),
          ...extra,
          candidates: { create: [{ name: "Aday A.Ş.", status }] },
        },
      });
    await run(withSuggestion.id, {}, "SUGGESTED");
    await run(dismissed.id, { dismissedAt: new Date() }, "SUGGESTED");
    await run(allInvited.id, {}, "INVITED");

    const { rows } = await service.satinalma(buyer.company.id);
    expect(rows.find((r) => r.key === "aiSuggestions")?.count).toBe(1);

    const listings = makeService().service;
    const tenders = await listings.listTenders(buyer.company.id, "ALIM");
    expect(tenders.filter((t) => t.aiSuggestionsPending).map((t) => t.id)).toEqual([
      withSuggestion.id,
    ]);
  });
});
