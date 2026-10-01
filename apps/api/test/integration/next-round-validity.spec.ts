/**
 * Yeni tur taşıması (madde 13, 2026-08-02) + geçerlilik uzatma.
 *
 * AUTO taşımada teklifler KOŞULSUZ canlı taşınır ve geçerlilikleri SÜRESİZE
 * (validityDays=null) çekilir — pazarlık boyunca teklif "dolmaz", geçerlilik
 * yeniden sorulmaz. Geçerlilik-farkında eleme/taslağa-düşürme KALDIRILDI.
 * extendBidValidity, tur açılmadan (değerlendirme evresinde) çalışmaya devam
 * eder — o senaryolar burada tur AÇMADAN test edilir.
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
    status: "IN_AWARD",
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
    select: {
      status: true,
      round: true,
      amount: true,
      validityDays: true,
      activeBidRound: true,
    },
  });

describe("AUTO taşıma — madde 13: koşulsuz canlı + süresiz", () => {
  it("geçerli VE süresi dolmuş teklif de CANLI taşınır; geçerlilik süresize çekilir", async () => {
    const { service, owner, valid, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto());

    const v = await bidOf(listing.id, valid.company.id);
    const e = await bidOf(listing.id, expired.company.id);
    expect(v).toMatchObject({ status: "SUBMITTED", round: 2, validityDays: null });
    expect(e).toMatchObject({ status: "SUBMITTED", round: 2, validityDays: null });
    expect(Number(e.amount)).toBe(900); // fiyat korunur
    // Taşıma TUR HAKKI yakmaz: activeBidRound taşımada güncellenmez —
    // taşınan firma yeni turda bir kez fiyat verebilir.
    expect(v.activeBidRound).not.toBe(2);
  });

  it("embargolu açılışta da teklif CANLI taşınır (madde 13); embargo görünürlük istisnası korunur", async () => {
    const { service, owner, valid, listing } = await closedRfq();
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
    // Madde 13: açılışa dek "dolacak" olsa bile taslağa düşmez — süresiz taşınır.
    const v = await bidOf(listing.id, valid.company.id);
    expect(v).toMatchObject({ status: "SUBMITTED", validityDays: null });

    // Embargo İSTİSNASI: teklifi olan firma açılış öncesi ilanı GÖREBİLİR;
    // teklifsiz firma göremez; teklif verme yine açılışa dek kapalı.
    const detail = (await service.getOne(valid.auth, listing.id)) as {
      isOwner: boolean;
      myBid: { status: string } | null;
    };
    expect(detail.myBid?.status).toBe("SUBMITTED");
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(service.getOne(stranger.auth, listing.id)).rejects.toThrow(
      /bulunamadı/,
    );
    await expect(
      service.placeBid(valid.auth, listing.id, {
        amount: 950,
        deliveryTime: "W1_2",
      } as never),
    ).rejects.toThrow(/henüz başlamadı/);
  });

  it("taşıma bildirimi: her iki teklif sahibi de 'taşındı' bildirimi alır (dolmuş küme yok)", async () => {
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
    // Madde 13: "geçerliliği doldu" kümesi yok — o da taşındı bildirimi alır.
    expect(
      expiredNotifs.some((n) => n.title.includes("taşındı")),
    ).toBe(true);
  });
});

/** Taslak canlandırma testleri için talebi teklif alımına açık hâle getirir. */
async function reopenForBids(listingId: string) {
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "OPEN", closesAt: FUTURE },
  });
}

describe("Geçerlilik uzatma (extendBidValidity)", () => {
  it("SUBMITTED teklif: validityDays artar (tur açılmadan — değerlendirme evresi)", async () => {
    const { service, valid, listing } = await closedRfq();
    const res = await service.extendBidValidity(valid.auth, listing.id, 30);
    expect(res).toMatchObject({ ok: true, validityDays: 90, revived: false });
  });

  it("taslağa düşmüş teklif: uzatınca AYNI fiyatla yeniden CANLI (revive yolu)", async () => {
    const { service, expired, listing } = await closedRfq();
    // Madde 13 sonrası taşıma taslağa düşürmüyor — revive yolunu doğrudan
    // DRAFT'a çekilmiş teklifle test et (mevcut turda taslak canlandırılır).
    await prisma.listingBid.updateMany({
      where: { listingId: listing.id, bidderCompanyId: expired.company.id },
      data: { status: "DRAFT" },
    });
    // Canlandırma = yeniden gönderim → yalnız teklif alımı açıkken (derin
    // denetim LU-15; IN_AWARD'da reddi derin-denetim-lu15.spec'te).
    await reopenForBids(listing.id);
    // 10 gün geçerliydi, 30 gün önce verildi → 20 gün geride. +60 gün → ileride.
    const res = await service.extendBidValidity(expired.auth, listing.id, 60);
    expect(res).toMatchObject({ ok: true, validityDays: 70, revived: true });
    const b = await bidOf(listing.id, expired.company.id);
    expect(b).toMatchObject({ status: "SUBMITTED", round: 1 });
    expect(Number(b.amount)).toBe(900);
  });

  it("op-rol kapısı: ALIM ilanında Satışçı rolü olmayan üye (SAHIP-only Kurucu dahil) uzatamaz", async () => {
    const { service, valid, listing } = await closedRfq();
    // Aynı firmadan rolsüz-Kurucu (yalnız SAHIP etiketi) → salt-gözlemci.
    const labelOnlyOwner: typeof valid.auth = {
      ...valid.auth,
      roles: ["SAHIP"],
    } as typeof valid.auth;
    await expect(
      service.extendBidValidity(labelOnlyOwner, listing.id, 30),
    ).rejects.toThrow(/'Teklif verme' yetkisi gerekir/);
    // ONAYLAYICI-only üye de uzatamaz.
    const approver: typeof valid.auth = {
      ...valid.auth,
      roles: ["ONAYLAYICI"],
      isOwner: false,
    } as typeof valid.auth;
    await expect(
      service.extendBidValidity(approver, listing.id, 30),
    ).rejects.toThrow(/'Teklif verme' yetkisi gerekir/);
    // Satışçı rolü taşıyan aynı üye geçer.
    const res = await service.extendBidValidity(valid.auth, listing.id, 30);
    expect(res.ok).toBe(true);
  });

  it("uzatma audit izi bırakır (düz uzatma + canlandırma metadata'sı)", async () => {
    const { service, valid, expired, listing } = await closedRfq();
    await service.extendBidValidity(valid.auth, listing.id, 30);
    const plain = await prisma.auditLog.findFirst({
      where: {
        action: "company.bid.validity_extended",
        tenantId: valid.company.id,
      },
    });
    expect(plain).toBeTruthy();
    expect(plain!.actorId).toBe(valid.user.id);
    expect(plain!.metadata).toMatchObject({
      listingId: listing.id,
      additionalDays: 30,
      revived: false,
    });
    // Taslağa düşmüş teklifin canlandırılması (SUBMITTED geçişi) da izli;
    // critical bayrağı persist edilmez, yalnız kayıp-alarm semantiğidir.
    await prisma.listingBid.updateMany({
      where: { listingId: listing.id, bidderCompanyId: expired.company.id },
      data: { status: "DRAFT" },
    });
    await reopenForBids(listing.id);
    await service.extendBidValidity(expired.auth, listing.id, 60);
    const revive = await prisma.auditLog.findFirst({
      where: {
        action: "company.bid.validity_extended",
        tenantId: expired.company.id,
      },
    });
    expect(revive).toBeTruthy();
    expect(revive!.metadata).toMatchObject({ revived: true });
  });

  it("yetersiz uzatma (son gün hâlâ geçmişte) reddedilir", async () => {
    const { service, expired, listing } = await closedRfq();
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

  it("değerlendirmedeki (IN_AWARD) ilanda uzatma SERBEST — alıcı karar verirken teklif dolmasın; sonuçlanmışta ve admin-CLOSED'da kapalı; teklifi olmayana 404", async () => {
    const { service, valid, expired, listing } = await closedRfq();
    // IN_AWARD'da uzatma serbest (alıcı karar verirken teklif dolmasın).
    const ext = await service.extendBidValidity(valid.auth, listing.id, 30);
    expect(ext.ok).toBe(true);
    // Sonuçlanmış (CLOSED_NO_AWARD) ihalede uzatılamaz.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "CLOSED_NO_AWARD" },
    });
    await expect(
      service.extendBidValidity(valid.auth, listing.id, 30),
    ).rejects.toThrow(/sonuçlandı/);
    // Denetim P2 #5: yönetici moderasyonu (CLOSED) — sahip/teklifçi aksiyonu yok.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "CLOSED" },
    });
    await expect(
      service.extendBidValidity(valid.auth, listing.id, 30),
    ).rejects.toThrow(/uzatılamaz/);
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

describe("Arayüz testi O-026 — RFQ yeni turu: geçerlilik ve elenen teklif", () => {
  it("RFQ turunda geçerli teklif CANLI taşınır ve geçerliliği KORUNUR; süresi dolmuş taslağa düşer (fiyat korunur)", async () => {
    const { service, owner, valid, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto({ type: "RFQ" }));

    const v = await bidOf(listing.id, valid.company.id);
    const e = await bidOf(listing.id, expired.company.id);
    expect(v).toMatchObject({ status: "SUBMITTED", round: 2, validityDays: 60 });
    expect(e).toMatchObject({ status: "DRAFT", round: 2, validityDays: 10 });
    expect(Number(e.amount)).toBe(900);

    // Süresi dolan taraf "geçerliliği uzat" ile aynı fiyatı canlandırabilir.
    const res = await service.extendBidValidity(expired.auth, listing.id, 60);
    expect(res).toMatchObject({ revived: true });
    expect(await bidOf(listing.id, expired.company.id)).toMatchObject({
      status: "SUBMITTED",
      round: 2,
    });
  });

  it("RFQ turunda süresi dolan tedarikçiye 'geçerliliği doldu', geçerli olana 'taşındı' bildirimi gider", async () => {
    const { service, owner, valid, expired, listing } = await closedRfq();
    await service.createNextRound(owner.auth, listing.id, nextRoundDto({ type: "RFQ" }));
    let validNotifs: { title: string }[] = [];
    let expiredNotifs: { title: string }[] = [];
    for (let i = 0; i < 40; i++) {
      [validNotifs, expiredNotifs] = await Promise.all([
        prisma.notification.findMany({
          where: { companyId: valid.company.id, type: "listing_new_round" },
          select: { title: true },
        }),
        prisma.notification.findMany({
          where: { companyId: expired.company.id, type: "listing_new_round" },
          select: { title: true },
        }),
      ]);
      if (validNotifs.length > 0 && expiredNotifs.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(validNotifs.some((n) => n.title.includes("taşındı"))).toBe(true);
    expect(expiredNotifs.some((n) => n.title.includes("geçerliliği doldu"))).toBe(true);
    expect(expiredNotifs.some((n) => n.title.includes("taşındı"))).toBe(false);
  });

  it.each(["RFQ", "ENGLISH_AUCTION"] as const)(
    "alıcının ELEDİĞİ teklif yeni tura taşınmaz (%s): eski turda LOST + gerekçesiyle kalır, taşındı bildirimi gitmez",
    async (type) => {
      const { service, owner, valid, expired, listing } = await closedRfq();
      const elim = await prisma.listingBid.findFirstOrThrow({
        where: { listingId: listing.id, bidderCompanyId: valid.company.id },
      });
      await service.eliminate(owner.auth, listing.id, elim.id, "teknik uygunsuz");
      await service.createNextRound(owner.auth, listing.id, nextRoundDto({ type }));

      const after = await prisma.listingBid.findUniqueOrThrow({ where: { id: elim.id } });
      expect(after).toMatchObject({
        status: "LOST",
        round: 1,
        eliminationReason: "teknik uygunsuz",
      });
      expect(after.eliminatedAt).not.toBeNull();
      // Elenmemiş teklif taşındı (pazarlıkta süresiz, RFQ'da süresi dolduğu için taslak).
      const other = await bidOf(listing.id, expired.company.id);
      expect(other.round).toBe(2);
      await new Promise((r) => setTimeout(r, 500));
      const carriedToEliminated = await prisma.notification.count({
        where: { companyId: valid.company.id, type: "listing_new_round" },
      });
      expect(carriedToEliminated).toBe(0);
    },
  );
});
