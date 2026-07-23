/**
 * Firma değerlendirmesi — op-rol kapısı (salt-okunur garanti denetimi #5).
 * Kalıcı itibar beyanını yalnız siparişin tarafı olan işlem rolü yazar:
 * alıcı yanı Satın Almacı, satıcı yanı Satışçı; etiket-only/rolsüz 403.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyReviewsService } from "../../src/modules/company-reviews/company-reviews.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function withRoles(
  auth: AuthenticatedCompanyUser,
  roles: CompanyRole[],
  isOwner = false,
): AuthenticatedCompanyUser {
  return { ...auth, roles, isOwner } as AuthenticatedCompanyUser;
}

async function completedOrder() {
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const order = await prisma.companyOrder.create({
    data: {
      buyerCompanyId: buyer.company.id,
      sellerCompanyId: seller.company.id,
      amount: 1000,
      status: "COMPLETED",
    },
  });
  return { buyer, seller, order };
}

describe("değerlendirme op-rol kapısı", () => {
  it("alıcı yanında etiket-only/rolsüz 403; Satın Almacı yazar — satıcı yanında Satışçı", async () => {
    const svc = new CompanyReviewsService(prisma as never);
    const { buyer, seller, order } = await completedOrder();
    const input = { orderId: order.id, rating: 5, comment: "iyi" };

    for (const p of [
      withRoles(buyer.auth, [CompanyRole.SAHIP], true),
      withRoles(buyer.auth, [CompanyRole.YONETICI]),
      withRoles(buyer.auth, [CompanyRole.ONAYLAYICI]),
      withRoles(buyer.auth, []),
    ]) {
      await expect(svc.upsert(p, input)).rejects.toThrow(
        /Satın Almacı rolü gerekir/,
      );
    }
    // Yön uyuşmayan işlem rolü de yazamaz (alıcı yanında yalnız-Satışçı).
    await expect(
      svc.upsert(withRoles(buyer.auth, [CompanyRole.SATISCI]), input),
    ).rejects.toThrow(/Satın Almacı rolü gerekir/);

    // Doğru roller geçer (factory kurucu SA+ST taşır).
    await expect(svc.upsert(buyer.auth, input)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      svc.upsert(withRoles(seller.auth, [CompanyRole.SATISCI]), input),
    ).resolves.toMatchObject({ ok: true });
    // Satıcı yanında etiket-only yazamaz.
    await expect(
      svc.upsert(withRoles(seller.auth, [CompanyRole.SAHIP], true), input),
    ).rejects.toThrow(/Satışçı rolü gerekir/);
  });
});
