/**
 * B2 (CL kör-nokta denetimi): adres silme guard'ı yalnız İLANLARI sayıyordu,
 * gönderilmiş TEKLİFLERİ değil. SATIS ilanına verilen SUBMITTED teklifin
 * deliveryAddressId'si silinen adrese (onDelete:SetNull) işaret ederse bid
 * adressiz kalır, award'da order teslim-adressiz doğardı. Guard artık aktif
 * (SUBMITTED) teklifleri de kilitler; WON/AWARDED_PARTIAL zaten order'a
 * snapshot'landığından kilitlemez.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem, makeBid } from "./factories";
import { CompanyAddressesService } from "../../src/modules/company-addresses/company-addresses.service";

const svc = new CompanyAddressesService(prisma as never);
const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// SATIS ilanına teklif veren firma + kendi teslimat adresine bağlı bir teklif.
async function setup(bidStatus: string) {
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" }); // teklif veren
  const addr = await prisma.companyAddress.create({
    data: {
      companyId: buyer.company.id,
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Örnek mah. No:1",
      city: "İstanbul",
      country: "TR",
    },
  });
  const listing = await makeListing(prisma, {
    companyId: seller.company.id,
    createdById: seller.user.id,
    type: "SATIS",
    status: "OPEN",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: buyer.company.id,
    createdById: buyer.user.id,
    amount: 100,
    status: bidStatus,
    items: [{ itemId: item.id, unitPrice: 100 }],
  });
  await prisma.listingBid.update({
    where: { id: bid.id },
    data: { deliveryAddressId: addr.id },
  });
  return { buyer, addr };
}

describe("B2 — adres silme guard'ı gönderilmiş teklifleri de sayar", () => {
  it("SUBMITTED teklif adresi kullanıyorsa silme REDDEDİLİR (400) → adres kalır", async () => {
    const { buyer, addr } = await setup("SUBMITTED");
    await expect(svc.remove(buyer.auth, addr.id)).rejects.toThrow(
      /gönderilmiş teklifte/i,
    );
    expect(await prisma.companyAddress.count({ where: { id: addr.id } })).toBe(1);
  });

  it("teklif LOST ise adres silinebilir (kilit yalnız SUBMITTED)", async () => {
    const { buyer, addr } = await setup("LOST");
    await expect(svc.remove(buyer.auth, addr.id)).resolves.toEqual({ ok: true });
    expect(await prisma.companyAddress.count({ where: { id: addr.id } })).toBe(0);
  });
});
