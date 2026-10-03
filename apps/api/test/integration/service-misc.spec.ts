/**
 * (3) Kalan servis metodları — çok-kiracılı scope (listMine/listMyBids/
 * listTenders/sellerTenders), deleteListing, changeClosingTime, updateInternalNotes,
 * addInvitations guard'ları, roundHistory, updateListing guard'ları.
 */
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import {
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("çok-kiracılı scope", () => {
  it("listMine yalnızca kendi firmasının ilanlarını döner", async () => {
    const { service } = makeService();
    const a = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      type: "ALIM",
    });
    await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      type: "ALIM",
    });
    await makeListing(prisma, {
      companyId: b.company.id,
      createdById: b.user.id,
      type: "ALIM",
    });
    const mine = await service.listMine(a.company.id);
    expect(mine).toHaveLength(2);
  });

  it("listTenders firmanın ALIM ilanlarını döner (tek tip — satış ilanı kaldırıldı)", async () => {
    const { service } = makeService();
    const a = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      type: "ALIM",
    });
    await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      type: "ALIM",
    });
    await makeListing(prisma, {
      companyId: b.company.id,
      createdById: b.user.id,
      type: "ALIM",
    });
    const tenders = await service.listTenders(a.company.id);
    expect(tenders).toHaveLength(2);
    expect(tenders.every((t) => t.type === "ALIM")).toBe(true);
  });

  it("listTenders yayımlanmamış talepte publishedAt null döner, createdAt'e düşmez (D-149)", async () => {
    const { service } = makeService();
    const a = await makeCompanyWithUser(prisma, { country: "TR" });
    const pub = new Date("2026-09-01T09:00:00Z");
    const draft = await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      status: "DRAFT",
      publishedAt: null,
    });
    const open = await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      status: "OPEN",
      publishedAt: pub,
      closesAt: FUTURE,
    });
    const tenders = await service.listTenders(a.company.id);
    const d = tenders.find((t) => t.id === draft.id)!;
    const o = tenders.find((t) => t.id === open.id)!;
    expect(d.publishedAt).toBeNull();
    expect(d.createdAt).toBeInstanceOf(Date);
    expect(o.publishedAt?.toISOString()).toBe(pub.toISOString());
  });

  it("listMyBids yalnızca firmanın verdiği teklifler", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: a.company.id,
      createdById: a.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: b.company.id,
      createdById: b.user.id,
      amount: 120,
      items: [{ itemId: item.id, unitPrice: 120 }],
    });
    const mineA = await service.listMyBids(a.company.id);
    expect(mineA.items).toHaveLength(1);
    expect(mineA.total).toBe(1);
    expect(mineA.counts).toEqual({ all: 1, active: 1, won: 0 });
    const mineOwner = await service.listMyBids(owner.company.id);
    expect(mineOwner.items).toHaveLength(0);
    expect(mineOwner.counts.all).toBe(0);
  });

  it("listMyBids LOST sebebini taşır: elenen eliminatedAt dolu, kazandırmada kaybeden boş (arayüz testi D-102)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const mk = (status: "AWARDED" | "OPEN") =>
      makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        type: "ALIM",
        status,
        closesAt: FUTURE,
      });
    const awarded = await mk("AWARDED");
    const open = await mk("OPEN");
    const lost = await makeBid(prisma, {
      listingId: awarded.id,
      bidderCompanyId: me.company.id,
      createdById: me.user.id,
      amount: 100,
      status: "LOST",
    });
    const eliminated = await makeBid(prisma, {
      listingId: open.id,
      bidderCompanyId: me.company.id,
      createdById: me.user.id,
      amount: 100,
      status: "LOST",
    });
    const at = new Date("2026-09-30T10:00:00.000Z");
    await prisma.listingBid.update({ where: { id: eliminated.id }, data: { eliminatedAt: at } });
    const res = await service.listMyBids(me.company.id);
    const byId = new Map(res.items.map((i) => [i.id, i] as const));
    expect(byId.get(lost.id)?.eliminatedAt).toBeNull();
    expect(byId.get(eliminated.id)?.eliminatedAt).toBe(at.toISOString());
  });

  it("listMyBids SAYFALI: 200 tavanı yok, sayaçlar süzgeçten bağımsız, süzgeç/arama/sıralama sunucuda (arayüz testi O-005)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const me = await makeCompanyWithUser(prisma, { country: "TR" });
    const statuses = ["SUBMITTED", "WON", "LOST", "AWARDED_PARTIAL"] as const;
    // 205 teklif (eski sabit `take: 200` tavanını aşar) — en ESKİSİ karar
    // bekleyen tek teklif ve "İstanbul" başlıklı.
    const listings = await Promise.all(
      Array.from({ length: 205 }, (_, i) =>
        makeListing(prisma, {
          companyId: owner.company.id,
          createdById: owner.user.id,
          type: "ALIM",
          status: i === 0 ? "OPEN" : "AWARDED",
          closesAt: FUTURE,
          ...(i === 0 ? { title: "İstanbul depo rafları" } : {}),
        }),
      ),
    );
    const base = Date.now() - 300 * 60_000;
    await prisma.listingBid.createMany({
      data: listings.map((l, i) => ({
        listingId: l.id,
        bidderCompanyId: me.company.id,
        createdById: me.user.id,
        amount: new Prisma.Decimal(i === 0 ? 1 : 100 + i),
        status: i === 0 ? "SUBMITTED" : statuses[1 + (i % 3)],
        createdAt: new Date(base + i * 60_000),
        submittedAt: new Date(base + i * 60_000),
      })),
    });
    const wonExpected = listings.filter((_, i) => i > 0 && 1 + (i % 3) !== 2).length;

    const first = await service.listMyBids(me.company.id, { pageSize: 50 });
    expect(first.total).toBe(205);
    expect(first.items).toHaveLength(50);
    expect(first.counts).toEqual({ all: 205, active: 1, won: wonExpected });

    // Son sayfa: en eski (karar bekleyen) teklif artık erişilebilir.
    const last = await service.listMyBids(me.company.id, { pageSize: 50, page: 5 });
    expect(last.page).toBe(5);
    expect(last.items).toHaveLength(5);
    expect(last.items.at(-1)?.listing.id).toBe(listings[0].id);
    // Aralık dışı sayfa son sayfaya sıkıştırılır.
    expect((await service.listMyBids(me.company.id, { pageSize: 50, page: 99 })).page).toBe(5);

    // Sunucu tarafı durum süzgeci — sayaçlar değişmez.
    const pending = await service.listMyBids(me.company.id, { status: ["SUBMITTED"] });
    expect(pending.total).toBe(1);
    expect(pending.items[0].listing.id).toBe(listings[0].id);
    expect(pending.counts.all).toBe(205);
    // KPI drill-down (D-120): `pending` = counts.active kümesi.
    const undecided = await service.listMyBids(me.company.id, { pending: true });
    expect(undecided.total).toBe(first.counts.active);
    expect(undecided.items[0].listing.id).toBe(listings[0].id);
    expect((await service.listMyBids(me.company.id, { pending: true, status: ["WON"] })).total).toBe(0);

    // Katlanmış arama (İ/ı): "istanbul" → "İstanbul depo rafları".
    const found = await service.listMyBids(me.company.id, { q: "istanbul" });
    expect(found.total).toBe(1);
    expect(found.items[0].listing.id).toBe(listings[0].id);

    // Tutar sıralaması (yüksek → düşük) ve en eski sıralaması.
    const byAmount = await service.listMyBids(me.company.id, { sort: "amount", pageSize: 3 });
    expect(byAmount.items.map((b) => b.amount)).toEqual(["304", "303", "302"]);
    const oldest = await service.listMyBids(me.company.id, { sort: "oldest", pageSize: 1 });
    expect(oldest.items[0].listing.id).toBe(listings[0].id);

    // Tarih aralığı: son 1 gün → hepsi; başka firma hiçbirini görmez.
    expect((await service.listMyBids(me.company.id, { days: 1 })).total).toBe(205);
    expect((await service.listMyBids(owner.company.id)).total).toBe(0);
  });

  it("liste kendi ilanını dışlar, başka firmanın görünür ilanını içerir", async () => {
    const { service } = makeService();
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "GOLD",
    });
    const theirs = await makeListing(prisma, {
      companyId: other.company.id,
      createdById: other.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    const ours = await makeListing(prisma, {
      companyId: viewer.company.id,
      createdById: viewer.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    // browse() söküldü — tek liste kaynağı sellerTenders.
    const res = (await service.sellerTenders(viewer.auth)) as Array<{
      id: string;
    }>;
    const ids = res.map((r) => r.id);
    expect(ids).toContain(theirs.id);
    expect(ids).not.toContain(ours.id);
  });
});

describe("deleteListing", () => {
  it("taslak silinir, yayınlanmış silinemez, sahip-dışı 404", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
    });
    const open = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });

    await expect(
      service.deleteListing(other.auth, draft.id),
    ).rejects.toThrow();
    await expect(
      service.deleteListing(owner.auth, open.id),
    ).rejects.toThrow(/taslak/i);
    await service.deleteListing(owner.auth, draft.id);
    expect(
      await prisma.listing.count({ where: { id: draft.id } }),
    ).toBe(0);
  });
});

describe("changeClosingTime / updateInternalNotes", () => {
  it("sahip kapanış zamanını değiştirir; sahip-dışı reddedilir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const newDate = new Date(Date.now() + 14 * 24 * 3600 * 1000);
    await expect(
      service.changeClosingTime(other.auth, listing.id, newDate.toISOString()),
    ).rejects.toThrow();
    await service.changeClosingTime(
      owner.auth,
      listing.id,
      newDate.toISOString(),
    );
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.closesAt!.getTime()).toBe(newDate.getTime());
  });

  it("sahip iç notları günceller; sahip-dışı 404", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.updateInternalNotes(other.auth, listing.id, "x"),
    ).rejects.toThrow();
    await service.updateInternalNotes(owner.auth, listing.id, "dahili not");
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.internalNotes).toBe("dahili not");
  });
});

describe("addInvitations / roundHistory / updateListing — guard'lar", () => {
  it("addInvitations sahip-dışı reddi + kapalı statüde reddi", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const open = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const closed = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
    });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.addInvitations(other.auth, open.id, ["ROT-0001"]),
    ).rejects.toThrow();
    await expect(
      service.addInvitations(owner.auth, closed.id, ["ROT-0001"]),
    ).rejects.toThrow(/davet/i);
  });

  it("STANDARD (downgrade): yeni ilan işi başlatamaz — publish/yeni-tur/davet kilitli", async () => {
    const { service } = makeService();
    // PAKET'ken ihale açmış, sonra STANDARD'a düşmüş firma.
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      closesAt: FUTURE,
    });
    const open = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    await expect(
      service.publishListing(owner.auth, draft.id),
    ).rejects.toThrow(/Gold paket/);
    await expect(
      service.addInvitations(owner.auth, open.id, ["ROT-0001"]),
    ).rejects.toThrow(/Gold paket/);
    await expect(
      service.createNextRound(owner.auth, open.id, {
        closesAt: FUTURE,
      } as never),
    ).rejects.toThrow(/Gold paket/);
  });

  it("roundHistory sahip-dışı reddi + boş geçmiş []", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.roundHistory(other.auth, listing.id),
    ).rejects.toThrow();
    expect(await service.roundHistory(owner.auth, listing.id)).toEqual([]);
  });

  it("updateListing: sahip-dışı 404 + teklif gelmişse kilit", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    const item = await makeItem(prisma, listing.id);
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    const dto = { type: "ALIM", title: "Güncel" } as never;
    await expect(
      service.updateListing(bidder.auth, listing.id, dto),
    ).rejects.toThrow();
    await expect(
      service.updateListing(owner.auth, listing.id, dto),
    ).rejects.toThrow(/teklif/i);
  });
});
