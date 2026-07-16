/**
 * INV-KYC-1 — para-taahhüdü doğuran aksiyonlar (teklif SUBMIT / award /
 * awardByItem / publishListing) firma doğrulaması (VERIFIED) ister. Taslak
 * kaydetme SERBEST. PENDING (belge yüklü, admin onayı bekliyor) YETMEZ.
 */
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const bidInput = (itemId: string, price: number) =>
  ({
    items: [{ itemId, unitPrice: price }],
    deliveryDate: FUTURE.toISOString(),
    validityDays: 30,
  }) as never;

async function openListing(ownerId: string, creatorId: string) {
  const listing = await makeListing(prisma, {
    companyId: ownerId,
    createdById: creatorId,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  return { listing, item };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("INV-KYC-1 — para-taahhüdü kapıları VERIFIED ister", () => {
  it("UNVERIFIED bidder: teklif SUBMIT → 403 yönlendirici; TASLAK SERBEST", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // VERIFIED
    const bidder = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "UNVERIFIED",
    });
    const { listing, item } = await openListing(
      owner.company.id,
      owner.user.id,
    );
    // SUBMIT → 403 + yönlendirici mesaj (belgelerinizi ... yükleyin).
    await expect(
      service.placeBid(bidder.auth, listing.id, bidInput(item.id, 100)),
    ).rejects.toThrow(/doğrulamanız tamamlanmadan.*teklif.*belgeler/is);
    // TASLAK → serbest (funnel kırılmaz).
    await expect(
      service.placeBid(bidder.auth, listing.id, {
        items: [{ itemId: item.id, unitPrice: 100 }],
        deliveryDate: FUTURE.toISOString(),
        validityDays: 30,
        asDraft: true,
      } as never),
    ).resolves.toBeDefined();
  });

  it("PENDING (belge yüklü, admin bekliyor) YETMEZ → SUBMIT 403", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "PENDING",
    });
    const { listing, item } = await openListing(
      owner.company.id,
      owner.user.id,
    );
    await expect(
      service.placeBid(bidder.auth, listing.id, bidInput(item.id, 100)),
    ).rejects.toThrow(/doğrulamanız tamamlanmadan/i);
  });

  it("VERIFIED bidder: teklif SUBMIT geçer", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" }); // VERIFIED
    const { listing, item } = await openListing(
      owner.company.id,
      owner.user.id,
    );
    await expect(
      service.placeBid(bidder.auth, listing.id, bidInput(item.id, 100)),
    ).resolves.toBeDefined();
  });

  it("UNVERIFIED owner: award / awardByItem / publishListing → 403", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "UNVERIFIED", // PAKET ama doğrulanmamış
    });
    const bidderco = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, item } = await openListing(
      owner.company.id,
      owner.user.id,
    );
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidderco.company.id,
      createdById: bidderco.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    await expect(service.award(owner.auth, listing.id, bid.id)).rejects.toThrow(
      /doğrulamanız tamamlanmadan.*kazandır/is,
    );
    await expect(
      service.awardByItem(owner.auth, listing.id, [
        { itemId: item.id, bidId: bid.id },
      ]),
    ).rejects.toThrow(/doğrulamanız tamamlanmadan.*kazandır/is);
    // publishListing (DRAFT ilan).
    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    await makeItem(prisma, draft.id);
    await expect(
      service.publishListing(owner.auth, draft.id),
    ).rejects.toThrow(/doğrulamanız tamamlanmadan.*yayınla/is);
  });

  it("VERIFIED owner: award geçer (kapı yalnız UNVERIFIED'ı durdurur)", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // VERIFIED
    const bidderco = await makeCompanyWithUser(prisma, { country: "TR" });
    const { listing, item } = await openListing(
      owner.company.id,
      owner.user.id,
    );
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidderco.company.id,
      createdById: bidderco.user.id,
      amount: 100,
      items: [{ itemId: item.id, unitPrice: 100 }],
    });
    await expect(
      service.award(owner.auth, listing.id, bid.id),
    ).resolves.toBeDefined();
  });
});
