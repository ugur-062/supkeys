/**
 * Yeni tur — GEÇERLİLİK-FARKINDA taşıma + geçerlilik uzatma.
 *
 * AUTO taşımada teklif, yeni turun AÇILIŞ tarihine kadar geçerliyse
 * (submittedAt + validityDays) CANLI taşınır; süresi dolmuşsa fiyatı
 * korunarak TASLAĞA düşer. Her iki grup da tur oluşturulunca in-app
 * bilgilendirilir. Süresi dolan, extendBidValidity ile fiyat değişmeden
 * uzatabilir — taslağa düşmüş teklif aynı fiyatla canlanır.
 */
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";
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

async function closedRfq() {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const valid = await makeCompanyWithUser(prisma, { country: "TR" });
  const expired = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "CLOSED",
    visibility: "PUBLIC",
    format: "RFQ",
    closesAt: new Date(Date.now() - 3600_000),
  });
  // 30 gün önce verilmiş: 60 gün geçerli → hâlâ geçerli; 10 gün geçerli → doldu.
  const submitted = new Date(Date.now() - 30 * DAY);
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: valid.company.id,
    createdById: valid.user.id,
    amount: 1000,
    submittedAt: submitted,
    validityDays: 60,
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: expired.company.id,
    createdById: expired.user.id,
    amount: 900,
    submittedAt: submitted,
    validityDays: 10,
  });
  return { service, owner, valid, expired, listing };
}

const nextRoundDto = (over: Record<string, unknown> = {}) =>
  ({
    type: "ENGLISH_AUCTION",
    carryBids: "AUTO",
    eliminateNonBidders: false,
    closesAt: FUTURE.toISOString(),
    priceDecrementType: "AMOUNT",
    priceDecrementValue: 50,
    priceDecrementBasis: "OWN_LAST_BID",
    bidVisibility: "OWN_RANK",
    ...over,
  }) as never;

const bidOf = (listingId: string, companyId: string) =>
  prisma.listingBid.findUniqueOrThrow({
    where: {
      listingId_bidderCompanyId: {
        listingId,
        bidderCompanyId: companyId,
      },
    },
    select: { status: true, round: true, amount: true, validityDays: true },
  });

describe("AUTO taşıma — geçerlilik ayrımı", () => {
  it("geçerli teklif CANLI, süresi dolan fiyatı korunarak TASLAK taşınır", async () => {
    const { service, owner, valid, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto());

    const v = await bidOf(listing.id, valid.company.id);
    const e = await bidOf(listing.id, expired.company.id);
    expect(v).toMatchObject({ status: "SUBMITTED", round: 2 });
    expect(e).toMatchObject({ status: "DRAFT", round: 2 });
    expect(Number(e.amount)).toBe(900); // fiyat korunur
  });

  it("embargolu açılışta referans AÇILIŞ tarihi: bugün geçerli ama açılışa dek dolacak teklif TASLAĞA düşer", async () => {
    const { service, owner, valid, expired, listing } = await closedRfq();
    // valid: 60 gün (30 gün önce) → son gün +30 gün. Açılış +40 gün → DOLMUŞ sayılır.
    // (expired zaten dolmuş.)
    const opensAt = new Date(Date.now() + 40 * DAY);
    const closes = new Date(Date.now() + 45 * DAY);
    await service.createNextRound(
      owner.auth,
      listing.id,
      nextRoundDto({
        bidsOpenAt: opensAt.toISOString(),
        closesAt: closes.toISOString(),
      }),
    );
    const v = await bidOf(listing.id, valid.company.id);
    expect(v.status).toBe("DRAFT");

    // Embargo İSTİSNASI: teklifi olan firma açılış öncesi ilanı GÖREBİLİR ve
    // geçerliliğini uzatabilir (bildirimin CTA'sı 404 olmasın); teklifsiz
    // firma embargoda ilanı göremez; teklif verme yine açılışa dek kapalı.
    const detail = (await service.getOne(valid.auth, listing.id)) as {
      isOwner: boolean;
      myBid: { status: string } | null;
    };
    expect(detail.myBid?.status).toBe("DRAFT");
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(service.getOne(stranger.auth, listing.id)).rejects.toThrow(
      /bulunamadı/,
    );
    // 60 gün önce +60g geçerli teklif → son gün bugün civarı geçmişte kalmış
    // olabilir; +90 gün uzatma açılışın (+40g) ilerisine taşır → canlanır.
    const ext = await service.extendBidValidity(valid.auth, listing.id, 90);
    expect(ext.revived).toBe(true);
    await expect(
      service.placeBid(valid.auth, listing.id, {
        amount: 950,
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
      } as never),
    ).rejects.toThrow(/henüz başlamadı/);
  });

  it("taşıma bildirimi: taşınana 'taşındı', süresi dolana 'geçerliliği doldu' (in-app)", async () => {
    const { service, owner, valid, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto());
    // Fire-and-forget bildirimler uzak dev DB'de birkaç round-trip sürer —
    // iki taraf da düşene dek bekle (üst sınır ~10 sn).
    let validNotifs: { title: string }[] = [];
    let expiredNotifs: { title: string; body: string }[] = [];
    for (let i = 0; i < 40; i++) {
      [validNotifs, expiredNotifs] = await Promise.all([
        prisma.notification.findMany({
          where: { companyId: valid.company.id, type: "listing_new_round" },
          select: { title: true },
        }),
        prisma.notification.findMany({
          where: { companyId: expired.company.id, type: "listing_new_round" },
          select: { title: true, body: true },
        }),
      ]);
      if (validNotifs.length > 0 && expiredNotifs.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(
      validNotifs.some((n) => n.title.includes("taşındı")),
    ).toBe(true);
    expect(
      expiredNotifs.some((n) => n.title.includes("geçerliliği doldu")),
    ).toBe(true);
    expect(
      expiredNotifs.find((n) => n.title.includes("geçerliliği doldu"))?.body,
    ).toMatch(/geçerlilik süresini uzatın/);
  });
});

describe("Geçerlilik uzatma (extendBidValidity)", () => {
  it("SUBMITTED teklif: validityDays artar", async () => {
    const { service, owner, valid, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto());
    const res = await service.extendBidValidity(valid.auth, listing.id, 30);
    expect(res).toMatchObject({ ok: true, validityDays: 90, revived: false });
  });

  it("süresi dolup taslağa düşen teklif: uzatınca AYNI fiyatla yeniden CANLI", async () => {
    const { service, owner, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto());
    // 10 gün geçerliydi, 30 gün önce verildi → 20 gün geride. +60 gün → ileride.
    const res = await service.extendBidValidity(expired.auth, listing.id, 60);
    expect(res).toMatchObject({ ok: true, validityDays: 70, revived: true });
    const b = await bidOf(listing.id, expired.company.id);
    expect(b).toMatchObject({ status: "SUBMITTED", round: 2 });
    expect(Number(b.amount)).toBe(900);
  });

  it("yetersiz uzatma (son gün hâlâ geçmişte) reddedilir", async () => {
    const { service, owner, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto());
    // 30 gün önce verildi, 10 gün geçerli; +10 gün → son gün yine geçmişte.
    await expect(
      service.extendBidValidity(expired.auth, listing.id, 10),
    ).rejects.toThrow(/Uzatma yetersiz/);
  });

  it("hiç gönderilmemiş ham taslak uzatılamaz", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: FUTURE,
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 500,
      status: "DRAFT",
    });
    await expect(
      service.extendBidValidity(bidder.auth, listing.id, 30),
    ).rejects.toThrow(/gönderilmiş bir teklif yok/);
  });

  it("kapalı ilanda uzatılamaz; teklifi olmayana 404", async () => {
    const { service, valid, expired, listing } = await closedRfq();
    // İlan CLOSED (yeni tur açılmadı) → uzatma kapalı.
    await expect(
      service.extendBidValidity(valid.auth, listing.id, 30),
    ).rejects.toThrow(/teklife kapalı/);
    // Teklifi olmayan firma → 404 (ilan OPEN olsa bile).
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    const open = await makeListing(prisma, {
      companyId: expired.company.id,
      createdById: expired.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: FUTURE,
    });
    await expect(
      service.extendBidValidity(stranger.auth, open.id, 30),
    ).rejects.toThrow(/teklifiniz yok/);
  });
});
