/**
 * S5 NÖBETÇİSİ — runFullAward, order.amount = bid.amount (güvenilen stored)
 * yolunu YALNIZ "bid.amount ≡ Σ(unitPrice × listingQty)" invariant'ı geçerliyken
 * uygular. Bugün invariant korunur (teklif DTO'sunda quantity yok + bidCount
 * kilidi listing miktarını dondurur); bu test invariant BOZULURSA award'ın
 * fail-closed olduğunu (yanlış tutarlı sipariş yazılmadığını) kanıtlar.
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

async function setup(bidAmount: string) {
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
    quantity: new Prisma.Decimal(2),
  });
  // unitPrice 100 × qty 2 = 200; bid.amount CAĞIRAN tarafından set edilir.
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidder.company.id,
    createdById: bidder.user.id,
    amount: bidAmount,
    currency: "TRY",
    items: [{ itemId: item.id, unitPrice: "100" }],
  });
  return { service, owner, listing, bid };
}

describe("S5 — order.amount nöbetçisi (runFullAward)", () => {
  it("tutarlı bid.amount (=Σ) → kazandırma başarılı, order.amount doğru", async () => {
    const { service, owner, listing, bid } = await setup("200");
    const res = (await service.award(owner.auth, listing.id, bid.id)) as {
      orderId: string;
    };
    const order = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: res.orderId },
    });
    expect(order.amount.toString()).toBe("200");
  });

  it("bid.amount ≠ Σ(unitPrice×listingQty) → award FAIL-CLOSED (sipariş yazılmaz)", async () => {
    // invariant ihlali simülasyonu: bid.amount 999 ama Σ = 200.
    const { service, owner, listing, bid } = await setup("999");
    await expect(service.award(owner.auth, listing.id, bid.id)).rejects.toThrow(
      /tutarsızlığı|durduruldu/,
    );
    // Sipariş OLUŞMAMALI, ilan AWARDED'a geçmemeli.
    expect(await prisma.companyOrder.count()).toBe(0);
    const l = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(l.status).toBe("OPEN");
  });
});
