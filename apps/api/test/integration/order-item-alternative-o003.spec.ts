import { Prisma } from "@prisma/client";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

/**
 * Arayüz testi O-003 — muadil (eşdeğer) teklifin marka / parça no bilgisi ve
 * kalemin istenen marka/MPN'i siparişe snapshot'lanır; iki kazandırma yolu
 * (toplu `award` + kalem bazlı `awardByItem`) aynı alanları yazar. Kalemin
 * kanonik birim kodu da artık düşmez.
 */
const FUTURE = new Date(Date.now() + 7 * 86_400_000);

async function setup() {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
  });
  const alt = await makeItem(prisma, listing.id, {
    lineNo: 1,
    name: "Rulman 6204",
    quantity: new Prisma.Decimal(200),
    unit: "adet",
    unitCode: "PIECE",
    brand: "SKF",
    mpn: "6204-2RS",
    alternativeAllowed: true,
  });
  const same = await makeItem(prisma, listing.id, {
    lineNo: 2,
    name: "Keçe",
    quantity: new Prisma.Decimal(10),
    unit: "adet",
    brand: "NOK",
    mpn: "TC-20",
  });
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidder.company.id,
    createdById: bidder.user.id,
    amount: 640 + 50,
    items: [
      { itemId: alt.id, unitPrice: 3.2 },
      { itemId: same.id, unitPrice: 5 },
    ],
  });
  await prisma.listingBidItem.updateMany({
    where: { bidId: bid.id, itemId: alt.id },
    data: { isAlternative: true, offeredBrand: " FAG ", offeredMpn: "6204-2Z-C3" },
  });
  // Muadil OLMAYAN satırdaki marka metni siparişe "teklif edilen" diye yazılmaz.
  await prisma.listingBidItem.updateMany({
    where: { bidId: bid.id, itemId: same.id },
    data: { isAlternative: false, offeredBrand: "BAŞKA" },
  });
  return { service, owner, listing, alt, same, bid };
}

async function orderItems(listingId: string) {
  const order = await prisma.companyOrder.findFirstOrThrow({ where: { listingId } });
  return prisma.companyOrderItem.findMany({
    where: { orderId: order.id },
    orderBy: { name: "desc" },
  });
}

describe("O-003 — muadil bilgisi siparişe taşınır", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("toplu kazandırma: istenen + teklif edilen marka/MPN ve birim kodu snapshot", async () => {
    const { service, owner, listing, bid } = await setup();
    await service.award(owner.auth, listing.id, bid.id);
    const [rulman, kece] = await orderItems(listing.id);
    expect(rulman).toMatchObject({
      name: "Rulman 6204",
      unitCode: "PIECE",
      requestedBrand: "SKF",
      requestedMpn: "6204-2RS",
      isAlternative: true,
      offeredBrand: "FAG",
      offeredMpn: "6204-2Z-C3",
    });
    expect(kece).toMatchObject({
      name: "Keçe",
      requestedBrand: "NOK",
      requestedMpn: "TC-20",
      isAlternative: false,
      offeredBrand: null,
      offeredMpn: null,
    });
  });

  it("kalem bazlı kazandırma da aynı alanları yazar", async () => {
    const { service, owner, listing, alt, same, bid } = await setup();
    await service.awardByItem(owner.auth, listing.id, [
      { itemId: alt.id, bidId: bid.id },
      { itemId: same.id, bidId: bid.id },
    ]);
    const [rulman, kece] = await orderItems(listing.id);
    expect(rulman).toMatchObject({
      unitCode: "PIECE",
      requestedBrand: "SKF",
      isAlternative: true,
      offeredBrand: "FAG",
      offeredMpn: "6204-2Z-C3",
    });
    expect(kece).toMatchObject({ isAlternative: false, offeredBrand: null });
  });
});
