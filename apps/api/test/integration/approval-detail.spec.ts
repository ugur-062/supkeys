/**
 * Yetki tablosu Faz 2 (2026-09-05) — onay DETAYI projeksiyonu
 * (`GET company/approvals/:id`): onaylayıcının karar bağlamı.
 *
 * Kazanan firma + Doğrulanmış rozeti + tutar, rekabet özeti (geçerli teklif
 * sayısı, en düşük / ikinci toplam, kazananın sırası), kalem sayısı/miktar,
 * kalem-bazlı satırlar; tedarikçi iletişim bilgisi TAŞIMAZ. Erişim: adımdaki
 * onaycı, başlatan ya da akış yöneticisi; başkası 404.
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CompanyRole } from "@rothern/db";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import {
  makeCompanyWithUser,
  makeItem,
  makeListing,
  makeUser,
} from "./factories";

function approvalsService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyApprovalsService(
    prisma as never,
    prisma as never,
    new EventEmitter2(),
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
  );
}

function authFor(
  u: { id: string; email: string },
  companyId: string,
  roles: CompanyRole[],
  permissions?: string[],
) {
  return {
    userId: u.id,
    companyId,
    email: u.email,
    roles,
    ...(permissions ? { permissions } : {}),
    country: "TR",
    tier: "GOLD",
    isOwner: false,
    companyVerificationStatus: "VERIFIED",
  } as never;
}

async function bid(
  listingId: string,
  bidder: { company: { id: string }; user: { id: string } },
  items: { itemId: string; unitPrice: number; quantity: number }[],
  currency: "TRY" | "USD" = "TRY",
) {
  const amount = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return prisma.listingBid.create({
    data: {
      listingId,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount,
      currency,
      status: "SUBMITTED",
      submittedAt: new Date(),
      items: {
        create: items.map((i) => ({ itemId: i.itemId, unitPrice: i.unitPrice })),
      },
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

async function scenario() {
  const co = await makeCompanyWithUser(prisma, { country: "TR" });
  const s1 = await makeCompanyWithUser(prisma, {
    country: "TR",
    name: "Doğrulanmış Tedarikçi A.Ş.",
    companyVerificationStatus: "VERIFIED",
  });
  const s2 = await makeCompanyWithUser(prisma, {
    country: "TR",
    name: "Ucuz Tedarikçi Ltd",
    companyVerificationStatus: "PENDING",
  });
  const s3 = await makeCompanyWithUser(prisma, { country: "TR", name: "Pahalı Ltd" });
  const listing = await makeListing(prisma, {
    companyId: co.company.id,
    createdById: co.user.id,
    type: "ALIM",
    status: "IN_AWARD",
    title: "Çelik boru alımı",
  });
  const i1 = await makeItem(prisma, listing.id, { lineNo: 1, name: "Boru DN50", quantity: 100, unit: "adet" });
  const i2 = await makeItem(prisma, listing.id, { lineNo: 2, name: "Boru DN80", quantity: 50, unit: "adet" });
  const b1 = await bid(listing.id, s1, [
    { itemId: i1.id, unitPrice: 10, quantity: 100 },
    { itemId: i2.id, unitPrice: 20, quantity: 50 },
  ]); // 2000
  const b2 = await bid(listing.id, s2, [
    { itemId: i1.id, unitPrice: 9, quantity: 100 },
    { itemId: i2.id, unitPrice: 19, quantity: 50 },
  ]); // 1850 — en düşük
  const b3 = await bid(listing.id, s3, [
    { itemId: i1.id, unitPrice: 15, quantity: 100 },
    { itemId: i2.id, unitPrice: 30, quantity: 50 },
  ]); // 3000
  const approver = await makeUser(prisma, co.company.id, [CompanyRole.ONAYLAYICI]);
  const approverAuth = authFor(approver, co.company.id, [CompanyRole.ONAYLAYICI]);
  return { co, s1, s2, s3, listing, i1, i2, b1, b2, b3, approver, approverAuth };
}

describe("approvals.getDetail — karar bağlamı", () => {
  it("toplu kazandırma: kazanan + doğrulanmış + tutar + rekabet sırası; onaylayıcı talebi açamaz", async () => {
    const svc = approvalsService();
    const sc = await scenario();
    const req = await prisma.approvalRequest.create({
      data: {
        companyId: sc.co.company.id,
        listingId: sc.listing.id,
        type: "LISTING_AWARD",
        status: "PENDING",
        amount: 2000,
        currency: "TRY",
        payload: { kind: "full", bidId: sc.b1.id },
        initiatorNote: "Doğrulanmış firma, teslim hızlı",
        createdById: sc.co.user.id,
        steps: { create: [{ approverUserId: sc.approver.id, order: 1, status: "PENDING" }] },
      },
    });

    const d = await svc.getDetail(sc.approverAuth, req.id);
    expect(d.award.kind).toBe("full");
    if (d.award.kind !== "full") throw new Error("kind");
    expect(d.award.winner).toMatchObject({
      companyName: "Doğrulanmış Tedarikçi A.Ş.",
      verified: true,
      amount: 2000,
      currency: "TRY",
      itemsCovered: 2,
    });
    expect(d.competition).toEqual({
      validBidCount: 3,
      currency: "TRY",
      currencyMixed: false,
      lowestTotal: 1850,
      secondLowestTotal: 2000,
      winnerRank: 2,
    });
    expect(d.listing.itemCount).toBe(2);
    expect(d.listing.totalQuantity).toEqual({ amount: 150, unit: "adet" });
    expect(d.initiatorNote).toBe("Doğrulanmış firma, teslim hızlı");
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0]).toMatchObject({ order: 1, status: "PENDING", mine: true });
    // Onaylayıcı-only: talep detayı bağlantısı YOK; kurucu için VAR.
    expect(d.canOpenListing).toBe(false);
    const ownerView = await svc.getDetail(sc.co.auth, req.id);
    expect(ownerView.canOpenListing).toBe(true);
    // Tedarikçi iletişim/adres bilgisi projeksiyonda yok.
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/email|phone|iban|address/i);
  });

  it("kalem-bazlı: satırlar ve kazanan özetleri; farklı para birimi işaretlenir", async () => {
    const svc = approvalsService();
    const sc = await scenario();
    // Dördüncü teklif USD → karışık para birimi.
    const s4 = await makeCompanyWithUser(prisma, { country: "TR", name: "Dolar Ltd" });
    await bid(sc.listing.id, s4, [{ itemId: sc.i1.id, unitPrice: 1, quantity: 100 }], "USD");
    const req = await prisma.approvalRequest.create({
      data: {
        companyId: sc.co.company.id,
        listingId: sc.listing.id,
        type: "LISTING_AWARD",
        status: "PENDING",
        amount: 1900,
        currency: "TRY",
        payload: {
          kind: "by-item",
          itemAwards: [
            { itemId: sc.i1.id, bidId: sc.b2.id },
            { itemId: sc.i2.id, bidId: sc.b1.id },
          ],
        },
        createdById: sc.co.user.id,
        steps: { create: [{ approverUserId: sc.approver.id, order: 1, status: "PENDING" }] },
      },
    });
    const d = await svc.getDetail(sc.approverAuth, req.id);
    expect(d.award.kind).toBe("by-item");
    if (d.award.kind !== "by-item") throw new Error("kind");
    expect(d.award.lines).toEqual([
      expect.objectContaining({ itemName: "Boru DN50", quantity: 100, unit: "adet", companyName: "Ucuz Tedarikçi Ltd", verified: false, unitPrice: 9, lineTotal: 900, currency: "TRY" }),
      expect.objectContaining({ itemName: "Boru DN80", quantity: 50, companyName: "Doğrulanmış Tedarikçi A.Ş.", verified: true, unitPrice: 20, lineTotal: 1000 }),
    ]);
    expect(d.award.winners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ companyName: "Ucuz Tedarikçi Ltd", total: 900, lineCount: 1 }),
        expect.objectContaining({ companyName: "Doğrulanmış Tedarikçi A.Ş.", total: 1000, lineCount: 1 }),
      ]),
    );
    expect(d.competition.validBidCount).toBe(4);
    expect(d.competition.currencyMixed).toBe(true);
    expect(d.competition.winnerRank).toBeNull(); // kalem bazlıda sıra yok
  });

  it("erişim: adımda olmayan üye 404; başlatan ve akış yöneticisi görür", async () => {
    const svc = approvalsService();
    const sc = await scenario();
    const req = await prisma.approvalRequest.create({
      data: {
        companyId: sc.co.company.id,
        listingId: sc.listing.id,
        type: "LISTING_AWARD",
        status: "PENDING",
        amount: 2000,
        currency: "TRY",
        payload: { kind: "full", bidId: sc.b1.id },
        createdById: sc.co.user.id,
        steps: { create: [{ approverUserId: sc.approver.id, order: 1, status: "PENDING" }] },
      },
    });
    const stranger = await makeUser(prisma, sc.co.company.id, [CompanyRole.ONAYLAYICI]);
    await expect(
      svc.getDetail(authFor(stranger, sc.co.company.id, [CompanyRole.ONAYLAYICI]), req.id),
    ).rejects.toThrow(/bulunamadı/);
    // Başlatan (kurucu auth) görür; akış yöneticisi (approvals:manage) görür.
    await expect(svc.getDetail(sc.co.auth, req.id)).resolves.toBeTruthy();
    const manager = await makeUser(prisma, sc.co.company.id, [CompanyRole.YONETICI]);
    await expect(
      svc.getDetail(authFor(manager, sc.co.company.id, [CompanyRole.YONETICI]), req.id),
    ).resolves.toBeTruthy();
    // Başka firmanın üyesi 404.
    await expect(svc.getDetail(sc.s1.auth, req.id)).rejects.toThrow(/bulunamadı/);
  });
});
