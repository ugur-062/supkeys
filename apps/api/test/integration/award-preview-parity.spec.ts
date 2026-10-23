/**
 * Kazandırma ÖNİZLEMESİ ⇔ gerçek kazandırma — `POST /company/listings/:id/
 * award/preview` (`awardPreview`) ile `award()` AYNI kararı vermeli: ekran
 * "Onaya gönder" penceresini yalnız önizleme `requiresApproval: true` derse
 * açar, değilse "GERİ ALINAMAZ" onayıyla doğrudan kazandırır. İkisi ayrışırsa
 * ya onay akışı sessizce atlanmış görünür ya da kullanıcı yanıltıcı pencere
 * görür. Tutar tek kaynaktan (`toTryAmount`: açılış damgası → teklif damgası →
 * bilinmiyorsa onay ZORUNLU), eşik eleme mantığı `buildApprovalPlan`dan.
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@rothern/db";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
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

const future = (d: number) => new Date(Date.now() + d * 86_400_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** Gerçek onay servisine bağlı ilan servisi (önizleme + kazandırma aynı motor). */
function makeRig() {
  const email = {
    send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }),
  };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const approvals = new CompanyApprovalsService(
    prisma as never,
    prisma as never,
    new EventEmitter2(),
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
  );
  const { service } = makeService();
  // @ts-expect-error test: sahte onay servisi gerçeğiyle değiştirilir.
  service["approvals"] = approvals;
  return { service, approvals };
}

interface Line {
  unitPrice: string;
  /** Kalemin kendi birimi (boş = teklifin ana birimi). */
  currency?: string;
  /** Kalem birimi → teklifin ana birimi damgası. */
  fxToBase?: string;
}

interface Scenario {
  /** Onay eşiği (TRY). `null` = aktif akış yok. */
  threshold: number | null;
  /** Teklif tutarı, ana birimde (kalem toplamıyla tutarlı olmalı). */
  amount: string;
  currency?: string;
  /** Teklifin kendi kur damgası (1 birim = X TRY). */
  bidRate?: string;
  /** Talebin açılış kur damgası. */
  listingRates?: Record<string, string>;
  lines?: Line[];
  bidStatus?: string;
  listingStatus?: string;
}

async function build(rig: ReturnType<typeof makeRig>, sc: Scenario) {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
  const approver = await makeUser(prisma, owner.company.id, ["ONAYLAYICI"] as never);
  if (sc.threshold != null) {
    const flow = await rig.approvals.createFlow(owner.auth, {
      name: "Kazandırma onayı",
      type: "LISTING_AWARD",
      steps: [{ approverUserId: approver.id, conditionMinAmount: sc.threshold }],
    } as never);
    await rig.approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
  }
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: (sc.listingStatus ?? "OPEN") as never,
    closesAt: future(3),
    ...(sc.listingRates ? { auctionRateSnapshot: sc.listingRates } : {}),
  });
  const lines = sc.lines ?? [{ unitPrice: sc.amount }];
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    items.push(
      await makeItem(prisma, listing.id, { quantity: new Prisma.Decimal(1) }),
    );
  }
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidder.company.id,
    createdById: bidder.user.id,
    amount: sc.amount,
    currency: sc.currency ?? "TRY",
    status: sc.bidStatus ?? "SUBMITTED",
    items: lines.map((l, i) => ({ itemId: items[i]!.id, unitPrice: l.unitPrice })),
  });
  if (sc.bidRate) {
    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { exchangeRateSnapshot: new Prisma.Decimal(sc.bidRate) },
    });
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.currency) continue;
    await prisma.listingBidItem.updateMany({
      where: { bidId: bid.id, itemId: items[i]!.id },
      data: {
        currency: l.currency as never,
        fxToBase: l.fxToBase ? new Prisma.Decimal(l.fxToBase) : null,
      },
    });
  }
  return { owner, bidder, approver, listing, bid };
}

/**
 * Önizleme → (salt-okunur olduğunu doğrula) → gerçek kazandırma. Önizlemenin
 * cevabı kazandırmanın fiilen yaptığıyla BİREBİR aynı olmalı.
 */
async function previewThenAward(sc: Scenario) {
  const rig = makeRig();
  const ctx = await build(rig, sc);
  const preview = await rig.service.awardPreview(
    ctx.owner.auth,
    ctx.listing.id,
    ctx.bid.id,
  );
  // Salt-okunur: önizleme istek/sipariş üretmez, durumu değiştirmez.
  expect(await prisma.approvalRequest.count()).toBe(0);
  expect(await prisma.companyOrder.count()).toBe(0);
  expect(
    (await prisma.listing.findUniqueOrThrow({ where: { id: ctx.listing.id } }))
      .status,
  ).toBe(sc.listingStatus ?? "OPEN");
  expect(
    (await prisma.listingBid.findUniqueOrThrow({ where: { id: ctx.bid.id } }))
      .status,
  ).toBe("SUBMITTED");

  const awarded = (await rig.service.award(
    ctx.owner.auth,
    ctx.listing.id,
    ctx.bid.id,
  )) as { pendingApproval?: boolean };
  const wentToApproval = awarded.pendingApproval === true;
  const request = await prisma.approvalRequest.findFirst({
    where: { listingId: ctx.listing.id },
    include: { steps: true },
  });
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: ctx.listing.id },
  });
  const orders = await prisma.companyOrder.findMany({
    where: { listingId: ctx.listing.id },
  });

  // SÖZLEŞME: önizleme = gerçek karar.
  expect(preview.requiresApproval).toBe(wentToApproval);
  if (wentToApproval) {
    expect(request).not.toBeNull();
    expect(listing.status).toBe("IN_AWARD_APPROVAL");
    expect(orders).toHaveLength(0);
  } else {
    expect(request).toBeNull();
    expect(listing.status).toBe("AWARDED");
    expect(orders.length).toBeGreaterThan(0);
  }
  return { preview, request, orders, ...ctx };
}

describe("awardPreview ⇔ award — TRY teklif", () => {
  it("aktif akış yok → önizleme 'onay gerekmez', kazandırma doğrudan sipariş yazar", async () => {
    const r = await previewThenAward({ threshold: null, amount: "5000" });
    expect(r.preview).toEqual({ requiresApproval: false });
    expect(r.orders[0]!.amount.toString()).toBe("5000");
  });

  it("eşik altı tutar → ikisi de onaysız", async () => {
    const r = await previewThenAward({ threshold: 1000, amount: "999.99" });
    expect(r.preview.requiresApproval).toBe(false);
  });

  it("eşiğe EŞİT tutar → ikisi de onaya gider (eşik dahil)", async () => {
    const r = await previewThenAward({ threshold: 1000, amount: "1000" });
    expect(r.preview.requiresApproval).toBe(true);
    expect(r.request!.amount!.toString()).toBe("1000");
    expect(r.request!.currency).toBe("TRY");
  });

  it("eşik üstü tutar → ikisi de onaya gider; istek tutarı teklifin TRY tutarı", async () => {
    const r = await previewThenAward({ threshold: 1000, amount: "2500.5" });
    expect(r.preview.requiresApproval).toBe(true);
    expect(r.request!.amount!.toString()).toBe("2500.5");
    expect(r.request!.steps.map((s) => s.status)).toEqual(["PENDING"]);
  });

  it("eşiksiz adım (koşulsuz akış) → en küçük tutar da onaya gider", async () => {
    const r = await previewThenAward({ threshold: 0, amount: "1" });
    expect(r.preview.requiresApproval).toBe(true);
  });
});

describe("awardPreview ⇔ award — USD damgalı teklif (eşik TRY bazında)", () => {
  it("ham tutar eşiğin ALTINDA ama TRY karşılığı ÜSTÜNDE → ikisi de onaya gider (teklif damgası)", async () => {
    // 100 USD × 40 = 4.000 TRY ≥ 1.000; ham 100 eşiği atlatamaz.
    const r = await previewThenAward({
      threshold: 1000,
      amount: "100",
      currency: "USD",
      bidRate: "40",
    });
    expect(r.preview.requiresApproval).toBe(true);
    expect(new Prisma.Decimal(r.request!.amount!).toString()).toBe("4000");
    expect(r.request!.currency).toBe("TRY");
  });

  it("TRY karşılığı eşiğin altında → ikisi de onaysız; sipariş teklifin kendi biriminde", async () => {
    // 100 USD × 40 = 4.000 TRY < 5.000.
    const r = await previewThenAward({
      threshold: 5000,
      amount: "100",
      currency: "USD",
      bidRate: "40",
    });
    expect(r.preview.requiresApproval).toBe(false);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0]!.currency).toBe("USD");
    expect(r.orders[0]!.amount.toString()).toBe("100");
  });

  it("açılış damgası teklif damgasından ÖNCE gelir (INV-FX-1) — ikisinde de aynı baz", async () => {
    // Açılış 30, teklif 40 → 100 USD = 3.000 TRY. Eşik 3.500: açılış bazında
    // altında (onaysız); teklif damgası kullanılsaydı 4.000 ile onaya giderdi.
    const below = await previewThenAward({
      threshold: 3500,
      amount: "100",
      currency: "USD",
      bidRate: "40",
      listingRates: { USD: "30" },
    });
    expect(below.preview.requiresApproval).toBe(false);

    await truncateAll();
    // Tersi: açılış 40, teklif 30 → 4.000 TRY ≥ 3.500 → onay.
    const above = await previewThenAward({
      threshold: 3500,
      amount: "100",
      currency: "USD",
      bidRate: "30",
      listingRates: { USD: "40" },
    });
    expect(above.preview.requiresApproval).toBe(true);
    expect(new Prisma.Decimal(above.request!.amount!).toString()).toBe("4000");
  });

  it("kur bilinmiyor (damga yok) → eşik ne kadar yüksek olursa olsun ikisi de onayı ZORUNLU kılar", async () => {
    const r = await previewThenAward({
      threshold: 1_000_000_000,
      amount: "100",
      currency: "USD",
    });
    expect(r.preview.requiresApproval).toBe(true);
    // Çevrilemeyen tutar kendi birimiyle saklanır (uydurma TRY yazılmaz).
    expect(new Prisma.Decimal(r.request!.amount!).toString()).toBe("100");
    expect(r.request!.currency).toBe("USD");
    expect(r.request!.steps.map((s) => s.status)).toEqual(["PENDING"]);
  });

  it("kur bilinmiyor + aktif akış yok → onay istenemez, ikisi de onaysız", async () => {
    const r = await previewThenAward({
      threshold: null,
      amount: "100",
      currency: "USD",
    });
    expect(r.preview.requiresApproval).toBe(false);
  });
});

describe("awardPreview ⇔ award — çok birimli teklif", () => {
  it("TRY ana birim + EUR kalem: eşik kalemlerin ANA BİRİM toplamına bakar", async () => {
    // 100 TRY + 10 EUR × 48 = 580 TRY. Eşik 500: yalnız TRY kalemi (100)
    // sayılsaydı onay atlanırdı.
    const r = await previewThenAward({
      threshold: 500,
      amount: "580",
      lines: [
        { unitPrice: "100" },
        { unitPrice: "10", currency: "EUR", fxToBase: "48" },
      ],
    });
    expect(r.preview.requiresApproval).toBe(true);
    expect(new Prisma.Decimal(r.request!.amount!).toString()).toBe("580");
    expect(r.request!.currency).toBe("TRY");
  });

  it("USD ana birim + EUR kalem, eşik altı → onaysız; para birimi başına ayrı sipariş", async () => {
    // 10 USD + 5 EUR × 1,2 = 16 USD × 40 = 640 TRY < 700.
    const r = await previewThenAward({
      threshold: 700,
      amount: "16",
      currency: "USD",
      bidRate: "40",
      lines: [
        { unitPrice: "10" },
        { unitPrice: "5", currency: "EUR", fxToBase: "1.2" },
      ],
    });
    expect(r.preview.requiresApproval).toBe(false);
    expect(
      r.orders.map((o) => `${o.amount.toString()} ${o.currency}`).sort(),
    ).toEqual(["10 USD", "5 EUR"]);
  });

  it("USD ana birim + EUR kalem, eşik üstü → ikisi de onaya gider (640 TRY)", async () => {
    const r = await previewThenAward({
      threshold: 600,
      amount: "16",
      currency: "USD",
      bidRate: "40",
      lines: [
        { unitPrice: "10" },
        { unitPrice: "5", currency: "EUR", fxToBase: "1.2" },
      ],
    });
    expect(r.preview.requiresApproval).toBe(true);
    expect(new Prisma.Decimal(r.request!.amount!).toString()).toBe("640");
  });
});

describe("awardPreview — kazandırma ile aynı kapılar", () => {
  it("kazandırmanın reddedeceği teklif için önizleme de reddeder (elenmiş / taslak / başka talebin teklifi)", async () => {
    for (const bidStatus of ["LOST", "DRAFT", "WITHDRAWN"]) {
      await truncateAll();
      const rig = makeRig();
      const ctx = await build(rig, { threshold: 1000, amount: "5000", bidStatus });
      await expect(
        rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        rig.service.awardPreview(ctx.owner.auth, ctx.listing.id, ctx.bid.id),
      ).rejects.toMatchObject({ status: 400 });
    }

    await truncateAll();
    const rig = makeRig();
    const a = await build(rig, { threshold: 1000, amount: "5000" });
    const otherListing = await makeListing(prisma, {
      companyId: a.owner.company.id,
      createdById: a.owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: future(3),
    });
    await expect(
      rig.service.awardPreview(a.owner.auth, otherListing.id, a.bid.id),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      rig.service.awardPreview(a.owner.auth, a.listing.id, "yok-boyle-teklif"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("süresi dolmuş teklif, askıdaki teklifçi ve belgesiz teklif (belge zorunlu talep): ikisi de AYNI hatayla reddeder", async () => {
    const both = async (
      rig: ReturnType<typeof makeRig>,
      ctx: Awaited<ReturnType<typeof build>>,
    ) => {
      const errOf = (p: Promise<unknown>) =>
        p.then(
          () => null,
          (e: { status?: number; message?: string }) => ({
            status: e.status,
            message: e.message,
          }),
        );
      const preview = await errOf(
        rig.service.awardPreview(ctx.owner.auth, ctx.listing.id, ctx.bid.id),
      );
      const award = await errOf(
        rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id),
      );
      expect(award).toMatchObject({ status: 400 });
      expect(preview).toEqual(award);
      expect(await prisma.approvalRequest.count()).toBe(0);
      expect(await prisma.companyOrder.count()).toBe(0);
    };

    // (1) Geçerliliği dolmuş teklif (Mimari Karar 6).
    let rig = makeRig();
    let ctx = await build(rig, { threshold: 1000, amount: "5000" });
    await prisma.listingBid.update({
      where: { id: ctx.bid.id },
      data: {
        submittedAt: new Date(Date.now() - 10 * 86_400_000),
        validityDays: 3,
      },
    });
    await both(rig, ctx);

    // (2) Askıya alınmış teklifçi.
    await truncateAll();
    rig = makeRig();
    ctx = await build(rig, { threshold: 1000, amount: "5000" });
    await prisma.company.update({
      where: { id: ctx.bidder.company.id },
      data: { isBlocked: true },
    });
    await both(rig, ctx);

    // (3) Talep teklif belgesi istiyor, teklifte belge yok.
    await truncateAll();
    rig = makeRig();
    ctx = await build(rig, { threshold: 1000, amount: "5000" });
    await prisma.listing.update({
      where: { id: ctx.listing.id },
      data: { requireBidDocument: true },
    });
    await both(rig, ctx);
  });

  it("doğrulanmamış firma: önizleme de kazandırma gibi 403 (INV-KYC-1)", async () => {
    const rig = makeRig();
    const ctx = await build(rig, { threshold: 1000, amount: "5000" });
    const unverified = {
      ...ctx.owner.auth,
      companyVerificationStatus: "UNVERIFIED",
    } as never;
    await expect(
      rig.service.award(unverified, ctx.listing.id, ctx.bid.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      rig.service.awardPreview(unverified, ctx.listing.id, ctx.bid.id),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("sahip olmayan firma 403, kazandırma izni olmayan üye 403, talebi açmayan operatör 403", async () => {
    const rig = makeRig();
    const ctx = await build(rig, { threshold: 1000, amount: "5000" });

    await expect(
      rig.service.awardPreview(ctx.bidder.auth, ctx.listing.id, ctx.bid.id),
    ).rejects.toMatchObject({ status: 403 });

    const viewer = {
      ...ctx.owner.auth,
      roles: [],
      permissions: ["buy:view"],
    } as never;
    await expect(
      rig.service.awardPreview(viewer, ctx.listing.id, ctx.bid.id),
    ).rejects.toMatchObject({ status: 403 });

    const colleague = await makeUser(prisma, ctx.owner.company.id, [
      "SATIN_ALMACI",
    ] as never);
    const colleagueAuth = {
      ...ctx.owner.auth,
      userId: colleague.id,
      email: colleague.email,
      roles: ["SATIN_ALMACI"],
    } as never;
    await expect(
      rig.service.awardPreview(colleagueAuth, ctx.listing.id, ctx.bid.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      rig.service.award(colleagueAuth, ctx.listing.id, ctx.bid.id),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("kazandırılmış / onayda bekleyen talepte önizleme 400; olmayan talepte 404", async () => {
    for (const listingStatus of ["AWARDED", "IN_AWARD_APPROVAL", "CANCELLED", "DRAFT"]) {
      await truncateAll();
      const rig = makeRig();
      const ctx = await build(rig, { threshold: 1000, amount: "5000", listingStatus });
      await expect(
        rig.service.awardPreview(ctx.owner.auth, ctx.listing.id, ctx.bid.id),
      ).rejects.toMatchObject({ status: 400 });
    }
    const rig = makeRig();
    const ctx = await build(rig, { threshold: 1000, amount: "5000" });
    await expect(
      rig.service.awardPreview(ctx.owner.auth, "yok-boyle-talep", ctx.bid.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("kapanmış, karar bekleyen (IN_AWARD) talepte de önizleme = kazandırma", async () => {
    const r = await previewThenAward({
      threshold: 1000,
      amount: "5000",
      listingStatus: "IN_AWARD",
    });
    expect(r.preview.requiresApproval).toBe(true);
  });
});

/**
 * Kullanıcı kararı 2026-10-07: "Kazandır" onay penceresi TUTARI söyler. Pencerede
 * gösterilen tutar istekle gelir (`expectedAmount`); sunucu kazandırma anındaki
 * teklif tutarı farklıysa 409 döner ve HİÇBİR ŞEY yazmaz (talep OPEN iken teklif
 * revize edilebilir — kullanıcı X'i onaylayıp Y ile sipariş oluşmasın).
 */
describe("award — pencerede gösterilen tutar (expectedAmount)", () => {
  const untouched = async (ctx: Awaited<ReturnType<typeof build>>) => {
    expect(await prisma.companyOrder.count()).toBe(0);
    expect(await prisma.approvalRequest.count()).toBe(0);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: ctx.listing.id } })).status,
    ).toBe("OPEN");
    expect(
      (await prisma.listingBid.findUniqueOrThrow({ where: { id: ctx.bid.id } })).status,
    ).toBe("SUBMITTED");
  };

  it("aynı tutar (ondalık yazımı farklı olsa da) → kazandırır", async () => {
    const rig = makeRig();
    const ctx = await build(rig, { threshold: null, amount: "1500" });
    await rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id, undefined, "1500.00");
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: ctx.listing.id } })).status,
    ).toBe("AWARDED");
    expect(await prisma.companyOrder.count()).toBe(1);
  });

  it("teklif pencere açıkken değişti → 409, sipariş/onay isteği yok, durum aynı", async () => {
    const rig = makeRig();
    const ctx = await build(rig, { threshold: null, amount: "1500" });
    // Kullanıcı 1.400 gördü ve onayladı; teklif bu arada 1.500 olmuş.
    await expect(
      rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id, undefined, "1400"),
    ).rejects.toMatchObject({ status: 409 });
    await untouched(ctx);
    // Güncel tutarla yeniden onaylanınca kazandırır.
    await rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id, undefined, "1500");
    expect(await prisma.companyOrder.count()).toBe(1);
  });

  it("onaya giden yolda da: farklı tutar → 409 ve onay isteği AÇILMAZ", async () => {
    const rig = makeRig();
    const ctx = await build(rig, { threshold: 1000, amount: "5000" });
    await expect(
      rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id, "not", "4000"),
    ).rejects.toMatchObject({ status: 409 });
    await untouched(ctx);
    const res = (await rig.service.award(
      ctx.owner.auth,
      ctx.listing.id,
      ctx.bid.id,
      "not",
      "5000",
    )) as { pendingApproval?: boolean };
    expect(res.pendingApproval).toBe(true);
    expect(await prisma.approvalRequest.count()).toBe(1);
  });

  it("tutar gönderilmezse (eski istemci) denetim yok; bozuk değer 409", async () => {
    const rig = makeRig();
    const ctx = await build(rig, { threshold: null, amount: "1500" });
    await expect(
      rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id, undefined, "abc"),
    ).rejects.toMatchObject({ status: 409 });
    await untouched(ctx);
    await rig.service.award(ctx.owner.auth, ctx.listing.id, ctx.bid.id);
    expect(await prisma.companyOrder.count()).toBe(1);
  });
});
