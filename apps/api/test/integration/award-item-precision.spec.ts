/**
 * S8 — order kalem precision tek-temsil. Kalem-bazlı kazandırma (buildItemGroups)
 * artık orderItem.unitPrice/quantity'yi ham Prisma.Decimal yazar (eskiden
 * Number() coercion). Bu test: (a) kalem-award precise unitPrice'ı birebir
 * saklar, (b) toplu-award ile kalem-award AYNI temsili üretir (drift yok).
 */
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";
import { Prisma } from "@rothern/db";

const future = (d: number) => new Date(Date.now() + d * 86_400_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** ALIM ilan + tek kalem (qty) + o kaleme precise unitPrice'lı bağlı teklifçi. */
async function setup(unitPrice: string, qty: string) {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, owner.company.id, bidder.company.id, owner.user.id);
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    closesAt: future(3),
  });
  const item = await makeItem(prisma, listing.id, {
    quantity: new Prisma.Decimal(qty),
  });
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidder.company.id,
    createdById: bidder.user.id,
    amount: new Prisma.Decimal(unitPrice).mul(qty).toString(),
    currency: "TRY",
    items: [{ itemId: item.id, unitPrice }],
  });
  return { service, owner, listing, item, bid };
}

describe("S8 — order kalem precision", () => {
  it("kalem-award: orderItem.unitPrice/quantity birebir Decimal saklanır", async () => {
    const { service, owner, listing, item, bid } = await setup("1234.56", "3");

    const res = (await service.awardByItem(owner.auth, listing.id, [
      { itemId: item.id, bidId: bid.id },
    ])) as { orders: { id: string }[] };

    const order = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: res.orders[0]!.id },
      include: { items: true },
    });
    expect(order.amount.toString()).toBe("3703.68"); // 1234.56 × 3
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.unitPrice.toString()).toBe("1234.56");
    expect(order.items[0]!.quantity.toString()).toBe("3");
  });

  it("toplu-award ile kalem-award AYNI orderItem temsilini üretir (S8 drift yok)", async () => {
    // Toplu award yolu (runFullAward) — referans temsil.
    const full = await setup("9876.54", "2");
    const fullRes = (await full.service.award(
      full.owner.auth,
      full.listing.id,
      full.bid.id,
    )) as { orderId: string };
    const fullOrder = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: fullRes.orderId },
      include: { items: true },
    });

    // Kalem award yolu (buildItemGroups) — aynı girdi.
    const item2 = await setup("9876.54", "2");
    const itemRes = (await item2.service.awardByItem(item2.owner.auth, item2.listing.id, [
      { itemId: item2.item.id, bidId: item2.bid.id },
    ])) as { orders: { id: string }[] };
    const itemOrder = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: itemRes.orders[0]!.id },
      include: { items: true },
    });

    // İki yol birebir aynı Decimal string'i saklar.
    expect(itemOrder.items[0]!.unitPrice.toString()).toBe(
      fullOrder.items[0]!.unitPrice.toString(),
    );
    expect(itemOrder.items[0]!.quantity.toString()).toBe(
      fullOrder.items[0]!.quantity.toString(),
    );
    expect(itemOrder.amount.toString()).toBe(fullOrder.amount.toString());
  });
});
