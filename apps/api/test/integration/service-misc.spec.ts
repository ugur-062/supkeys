/**
 * (3) Kalan servis metodları — çok-kiracılı scope (listMine/listMyBids/
 * listTenders/browse), deleteListing, changeClosingTime, updateInternalNotes,
 * addInvitations guard'ları, roundHistory, updateListing guard'ları.
 */
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
      type: "SATIS",
    });
    await makeListing(prisma, {
      companyId: b.company.id,
      createdById: b.user.id,
      type: "ALIM",
    });
    const mine = await service.listMine(a.company.id);
    expect(mine).toHaveLength(2);
  });

  it("listTenders tipe göre ayrışır: varsayılan ALIM, SATIS istenince satış ilanları", async () => {
    const { service } = makeService();
    const a = await makeCompanyWithUser(prisma, { country: "TR" });
    await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      type: "ALIM",
    });
    await makeListing(prisma, {
      companyId: a.company.id,
      createdById: a.user.id,
      type: "SATIS",
    });
    const tenders = await service.listTenders(a.company.id);
    expect(tenders).toHaveLength(1);
    expect(tenders[0]!.type).toBe("ALIM");
    const satis = await service.listTenders(a.company.id, "SATIS");
    expect(satis).toHaveLength(1);
    expect(satis[0]!.type).toBe("SATIS");
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
    expect(await service.listMyBids(a.company.id)).toHaveLength(1);
    expect(await service.listMyBids(owner.company.id)).toHaveLength(0);
  });

  it("browse kendi ilanını dışlar, başka firmanın görünür ilanını içerir", async () => {
    const { service } = makeService();
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "PAKET",
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
    const res = (await service.browse(viewer.auth, "domestic")) as Array<{
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
