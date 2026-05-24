/**
 * Çoklu+tipli kalem sorusu testi için OPEN_FOR_BIDS, davetli bir ihale.
 * Kullanım: pnpm --filter @supkeys/db tsx prisma/scripts/seed-question-tender.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TENDER_NUMBER = "TEST-Q-0001";

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
      type: "RFQ",
      status: "OPEN_FOR_BIDS",
      title: "TEST — Çoklu Soru Kalemi",
      primaryCurrency: "TRY",
      paymentTerm: "CASH",
      publishedAt: new Date(),
      bidsOpenAt: new Date(),
      bidsCloseAt: closeAt,
      items: {
        create: {
          orderIndex: 1,
          name: "Test Kalemi",
          quantity: "5",
          unit: "adet",
          targetUnitPrice: "100",
          questions: [
            {
              id: "q1",
              text: "Garanti süresi kaç yıl?",
              answerType: "NUMBER",
              required: true,
            },
            {
              id: "q2",
              text: "Menşei ülke?",
              answerType: "TEXT",
              required: false,
            },
          ],
        },
      },
      invitations: {
        create: { supplierId, status: "ACCEPTED", respondedAt: new Date() },
      },
    },
    include: { items: true },
  });

  console.log("✓ Sorulu ihale:", tender.tenderNumber, "| item:", tender.items[0].id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
