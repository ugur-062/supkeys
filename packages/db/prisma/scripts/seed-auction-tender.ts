/**
 * İngiliz Usulü (açık eksiltme) test ihaleleri — iki tedarikçi davetli:
 *   TEST-AUC-OWN  : basis OWN_LAST_BID, %5
 *   TEST-AUC-BEST : basis BEST_BID, %5  (mevcut en iyiyi geç)
 * Görünürlük: ALL (tam anonim sıralama). Her ikisi de OPEN_FOR_BIDS.
 * Kullanım: pnpm --filter @supkeys/db tsx prisma/scripts/seed-auction-tender.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantUser = await prisma.user.findUnique({
    where: { email: "ugur@demo.com" },
    select: { id: true, tenantId: true },
  });
  if (!tenantUser) throw new Error("tenant user yok");
  const s1 = await prisma.supplierUser.findUnique({
    where: { email: "demo-supplier@firma.com" },
    select: { supplierId: true },
  });
  const s2 = await prisma.supplierUser.findUnique({
    where: { email: "demo-supplier2@firma.com" },
    select: { supplierId: true },
  });
  if (!s1 || !s2) throw new Error("iki tedarikçi de gerekli (seed-second-supplier çalıştır)");

  const { tenantId } = tenantUser;
  const supplierIds = [s1.supplierId, s2.supplierId];
  for (const supplierId of supplierIds) {
    await prisma.supplierTenantRelation.upsert({
      where: { supplierId_tenantId: { supplierId, tenantId } },
      create: { supplierId, tenantId, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
  }

  const closeAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  async function makeAuction(
    number: string,
    basis: "OWN_LAST_BID" | "BEST_BID",
  ) {
    const ex = await prisma.tender.findUnique({
      where: { tenderNumber: number },
      select: { id: true },
    });
    if (ex) {
      await prisma.bid.deleteMany({ where: { tenderId: ex.id } });
      await prisma.tender.delete({ where: { id: ex.id } });
    }
    const t = await prisma.tender.create({
      data: {
        tenantId,
        createdById: tenantUser!.id,
        tenderNumber: number,
        type: "ENGLISH_AUCTION",
        status: "OPEN_FOR_BIDS",
        title: `TEST — Açık Eksiltme (${basis})`,
        primaryCurrency: "TRY",
        paymentTerm: "CASH",
        bidVisibility: "ALL",
        priceDecrementType: "PERCENT",
        priceDecrementValue: "5",
        priceDecrementBasis: basis,
        autoExtendOnLateBid: true,
        autoExtendThresholdMin: 2,
        autoExtendByMinutes: 2,
        publishedAt: new Date(),
        bidsOpenAt: new Date(),
        bidsCloseAt: closeAt,
        items: {
          create: {
            orderIndex: 1,
            name: "Eksiltme Kalemi",
            quantity: "10",
            unit: "adet",
            targetUnitPrice: "100",
          },
        },
        invitations: {
          create: supplierIds.map((supplierId) => ({
            supplierId,
            status: "ACCEPTED" as const,
            respondedAt: new Date(),
          })),
        },
      },
      include: { items: true },
    });
    console.log(`✓ ${number} (${basis}) id=${t.id} item=${t.items[0].id}`);
  }

  await makeAuction("TEST-AUC-OWN", "OWN_LAST_BID");
  await makeAuction("TEST-AUC-BEST", "BEST_BID");
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
