/**
 * Otomatik süre uzatma testi: kapanışı 120 sn sonra, eşik 3 dk, uzatma 5 dk.
 * Kapanışa eşikten az kala (120s < 180s) gelen teklif → bidsCloseAt +5dk.
 * Kullanım: pnpm --filter @supkeys/db tsx prisma/scripts/seed-auction-autoextend.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TENDER_NUMBER = "TEST-AUC-EXT";

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
  if (!s1) throw new Error("supplier yok");

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId: s1.supplierId, tenantId: tenantUser.tenantId } },
    create: { supplierId: s1.supplierId, tenantId: tenantUser.tenantId, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });

  const ex = await prisma.tender.findUnique({
    where: { tenderNumber: TENDER_NUMBER },
    select: { id: true },
  });
  if (ex) {
    await prisma.bid.deleteMany({ where: { tenderId: ex.id } });
    await prisma.tender.delete({ where: { id: ex.id } });
  }

  const closeAt = new Date(Date.now() + 120_000); // 120 sn sonra
  const t = await prisma.tender.create({
    data: {
      tenantId: tenantUser.tenantId,
      createdById: tenantUser.id,
      tenderNumber: TENDER_NUMBER,
      type: "ENGLISH_AUCTION",
      status: "OPEN_FOR_BIDS",
      title: "TEST — Otomatik Süre Uzatma",
      primaryCurrency: "TRY",
      paymentTerm: "CASH",
      bidVisibility: "ALL",
      priceDecrementType: "PERCENT",
      priceDecrementValue: "5",
      priceDecrementBasis: "OWN_LAST_BID",
      autoExtendOnLateBid: true,
      autoExtendThresholdMin: 3, // 3 dk eşik
      autoExtendByMinutes: 5, // 5 dk uzat
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
        create: { supplierId: s1.supplierId, status: "ACCEPTED", respondedAt: new Date() },
      },
    },
    include: { items: true },
  });

  console.log(`${t.id}|${t.items[0]!.id}|${closeAt.toISOString()}`);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
