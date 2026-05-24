/**
 * Rapor doğrulaması için deterministik bir AWARDED ihale oluşturur.
 *
 * Bilinen sayılar:
 *   - 1 kalem: quantity=10, targetUnitPrice=100  → hedef toplam = 1000
 *   - Kazanan teklif: unitPrice=90, totalPrice=900, awardedQuantity=10
 *     Bid.totalAmount=900, status=AWARDED_FULL, BidItem.isWinner=true
 *   Beklenen: savings = 1000-900 = 100 (%10), winningTotal/actualTotal = 900
 *
 * Kullanım: pnpm --filter @supkeys/db tsx prisma/scripts/seed-awarded-tender.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENDER_NUMBER = "TEST-AWARD-0001";
const TENANT_USER_EMAIL = "ugur@demo.com";
const SUPPLIER_USER_EMAIL = "demo-supplier@firma.com";

async function main() {
  const tenantUser = await prisma.user.findUnique({
    where: { email: TENANT_USER_EMAIL },
    select: { id: true, tenantId: true },
  });
  if (!tenantUser) throw new Error(`Tenant user yok: ${TENANT_USER_EMAIL}`);

  const supplierUser = await prisma.supplierUser.findUnique({
    where: { email: SUPPLIER_USER_EMAIL },
    select: { id: true, supplierId: true },
  });
  if (!supplierUser) throw new Error(`Supplier user yok: ${SUPPLIER_USER_EMAIL}`);

  const { tenantId } = tenantUser;
  const { supplierId } = supplierUser;

  // İlişki ACTIVE olsun
  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId, tenantId } },
    create: { supplierId, tenantId, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });

  // Önceki test ihalesini temizle (cascade: items/invitations/bids)
  const existing = await prisma.tender.findUnique({
    where: { tenderNumber: TENDER_NUMBER },
    select: { id: true },
  });
  if (existing) {
    // Önce bid'ler (bidItem'lar cascade) — BidItem→TenderItem FK restrict olduğu
    // için tender'ı doğrudan silmek FK ihlali verir.
    await prisma.bid.deleteMany({ where: { tenderId: existing.id } });
    await prisma.tender.delete({ where: { id: existing.id } });
    console.log(`Eski ${TENDER_NUMBER} silindi.`);
  }

  const now = new Date();
  const closedAt = new Date(now.getTime() - 60 * 60 * 1000); // 1 saat önce

  const tender = await prisma.tender.create({
    data: {
      tenantId,
      createdById: tenantUser.id,
      tenderNumber: TENDER_NUMBER,
      type: "RFQ",
      status: "AWARDED",
      title: "TEST — Rapor Doğrulama (Awarded)",
      description: "Rapor savings/winningTotal testi için seed edildi.",
      primaryCurrency: "TRY",
      paymentTerm: "CASH",
      // Tahmini (hedef) toplam — gerçek ihalelerde wizard hesaplar: 10 × 100 = 1000
      estimatedTotal: "1000",
      publishedAt: closedAt,
      bidsOpenAt: closedAt,
      bidsCloseAt: closedAt,
      awardedAt: now,
      items: {
        create: {
          orderIndex: 1,
          name: "Test Kalemi",
          quantity: "10",
          unit: "adet",
          targetUnitPrice: "100", // hedef toplam = 10 * 100 = 1000
        },
      },
      invitations: {
        create: {
          supplierId,
          status: "ACCEPTED",
          respondedAt: closedAt,
        },
      },
    },
    include: { items: true },
  });

  const tenderItem = tender.items[0];

  // Kazanan teklif: 10 * 90 = 900
  await prisma.bid.create({
    data: {
      tenderId: tender.id,
      supplierId,
      submittedById: supplierUser.id,
      status: "AWARDED_FULL",
      currency: "TRY",
      totalAmount: "900",
      version: 1,
      submittedAt: closedAt,
      items: {
        create: {
          tenderItemId: tenderItem.id,
          unitPrice: "90",
          totalPrice: "900",
          currency: "TRY",
          isWinner: true,
          awardedQuantity: "10",
        },
      },
    },
  });

  console.log("✓ AWARDED ihale oluşturuldu:");
  console.log(`  tenderId      = ${tender.id}`);
  console.log(`  tenderNumber  = ${TENDER_NUMBER}`);
  console.log(`  Beklenen → targetTotal=1000, actualTotal=900, savings=100 (%10), winningTotal=900`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
