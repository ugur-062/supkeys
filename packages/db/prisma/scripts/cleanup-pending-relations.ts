import { PrismaClient } from "@prisma/client";

/**
 * D.2.B mimari sadeleştirmesinin ardından (tenant approval adımı kaldırıldı)
 * eski testlerden kalan PENDING_TENANT_APPROVAL kayıtlarını ACTIVE'e geçir.
 *
 * Schema'daki enum value korunuyor (legacy uyumluluk), sadece kullanım kalmaz.
 *
 * Çalıştırma:
 *   pnpm --filter @supkeys/db cleanup-pending-relations
 */

const prisma = new PrismaClient();

async function main() {
  console.log("Checking for PENDING_TENANT_APPROVAL relations…");

  const pending = await prisma.supplierTenantRelation.findMany({
    where: { status: "PENDING_TENANT_APPROVAL" },
    include: {
      supplier: { select: { companyName: true } },
      tenant: { select: { name: true } },
    },
  });

  if (pending.length === 0) {
    console.log("✓ No PENDING_TENANT_APPROVAL relations found.");
    return;
  }

  console.log(`Found ${pending.length} PENDING_TENANT_APPROVAL relation(s):`);
  for (const rel of pending) {
    console.log(`  - ${rel.supplier.companyName} → ${rel.tenant.name} (${rel.id})`);
  }

  console.log("\nUpgrading all to ACTIVE…");
  const result = await prisma.supplierTenantRelation.updateMany({
    where: { status: "PENDING_TENANT_APPROVAL" },
    data: { status: "ACTIVE" },
  });

  console.log(`✓ Upgraded ${result.count} relation(s) to ACTIVE.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
