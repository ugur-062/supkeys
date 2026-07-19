/**
 * INV-AUDIT-1 (dalga 3) — Teklif gönderimi denetim izi.
 * placeBid SUBMITTED → company.bid.submitted izi (actor=teklif veren kullanıcı,
 * tenant=teklif veren firma, entity=listing_bid). Taslak iz DÜŞÜRMEZ.
 * Aksiyonun kendi davranışı ayrı spec'te (placebid-eligibility) — burada yalnız iz.
 */
import { prisma, truncateAll } from "./test-db";
import {
  connect,
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

/** ALIM ilanı + kalem + ilana bağlı (CONNECTIONS görünür) teklif veren firma. */
async function rig() {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "CONNECTIONS",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  return { service, owner, bidder, listing, item };
}

const bidDto = (itemId: string, extra: Record<string, unknown> = {}) =>
  ({
    items: [{ itemId, unitPrice: 100 }],
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
    ...extra,
  }) as never;

describe("teklif gönderimi audit'i", () => {
  it("SUBMITTED teklif → company.bid.submitted iz (actor=teklif veren, tenant=teklif veren firma)", async () => {
    const { service, bidder, listing, item } = await rig();

    const res = (await service.placeBid(
      bidder.auth,
      listing.id,
      bidDto(item.id),
    )) as { id: string; status: string };
    expect(res.status).toBe("SUBMITTED");

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.bid.submitted", entityId: res.id },
    });
    expect(row.actorType).toBe("company");
    expect(row.actorId).toBe(bidder.user.id);
    expect(row.tenantId).toBe(bidder.company.id);
    expect(row.entityType).toBe("listing_bid");
    expect(row.metadata).toMatchObject({
      listingId: listing.id,
      listingType: "ALIM",
      amount: 100,
      resubmission: false,
    });
    // İlk gönderim → sürüm 1.
    expect((row.metadata as Record<string, unknown>).version).toBe(1);
  });

  it("taslak (asDraft) → iz DÜŞMEZ (taahhüt değil)", async () => {
    const { service, bidder, listing, item } = await rig();

    const res = (await service.placeBid(
      bidder.auth,
      listing.id,
      bidDto(item.id, { asDraft: true }),
    )) as { id: string; status: string };
    expect(res.status).toBe("DRAFT");

    const count = await prisma.auditLog.count({
      where: { action: "company.bid.submitted" },
    });
    expect(count).toBe(0);
  });
});
