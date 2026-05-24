/**
 * İngiliz Usulü (açık eksiltme) test ihalesi: OPEN_FOR_BIDS, davetli,
 * %5 min azaltma (kendi son teklifine göre), BEST_AND_OWN_RANK görünürlük.
 * Kullanım: pnpm --filter @supkeys/db tsx prisma/scripts/seed-auction-tender.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TENDER_NUMBER = "TEST-AUC-0001";

async function main() {
  const tenantUser = await prisma.user.findUnique({
    where: { email: "ugur@demo.com" },
    select: { id: true, tenantId: true },
  });
  if (!tenantUser) throw new Error("tenant user yok");
  const supplierUser = await prisma.supplierUser.findUnique({
    where: { email: "demo-supplier@firma.com" },
    select: { supplierId: true },
  });
  if (!supplierUser) throw new Error("supplier user yok");

  const { tenantId } = tenantUser;
  const { supplierId } = supplierUser;

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId, tenantId } },
    create: { supplierId, tenantId, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });

  const existing = await prisma.tender.findUnique({
    where: { tenderNumber: TENDER_NUMBER },
    select: { id: true },
  });
  if (existing) {
    await prisma.bid.deleteMany({ where: { tenderId: existing.id } });
    await prisma.tender.delete({ where: { id: existing.id } });
  }

  const closeAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tender = await prisma.tender.create({
    data: {
      tenantId,
      createdById: tenantUser.id,
      tenderNumber: TENDER_NUMBER,
      type: "ENGLISH_AUCTION",
      status: "OPEN_FOR_BIDS",
      title: "TEST — İngiliz Usulü Açık Eksiltme",
      primaryCurrency: "TRY",
      paymentTerm: "CASH",
      bidVisibility: "BEST_AND_OWN_RANK",
      priceDecrementType: "PERCENT",
      priceDecrementValue: "5",
      priceDecrementBasis: "OWN_LAST_BID",
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
        create: { supplierId, status: "ACCEPTED", respondedAt: new Date() },
      },
    },
    include: { items: true },
  });

  console.log(
    "✓ Auction:",
    tender.tenderNumber,
    "| id:",
    tender.id,
    "| item:",
    tender.items[0].id,
    "| %5 azaltma",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
