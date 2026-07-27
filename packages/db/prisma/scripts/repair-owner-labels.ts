/**
 * Sahiplik etiketi onarımı — company.ownerUserId'si olduğu hâlde rol dizisinde
 * SAHIP taşımayan kullanıcılara SAHIP'i geri ekler (eski/tutarsız veri).
 * Çalışma zamanı normalizasyonu (jwt strategy + /me + rol güncelleme) bu
 * durumu zaten maskeler; script DB'yi de gerçekle hizalar. Idempotent.
 *
 * Çalıştırma: `pnpm --filter @rothern/db repair-owner-labels`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    where: { ownerUserId: { not: null } },
    select: { id: true, name: true, ownerUserId: true },
  });
  let fixed = 0;
  for (const c of companies) {
    const owner = await prisma.companyUser.findUnique({
      where: { id: c.ownerUserId! },
      select: { id: true, email: true, roles: true },
    });
    if (!owner || owner.roles.includes("SAHIP")) continue;
    await prisma.companyUser.update({
      where: { id: owner.id },
      data: { roles: ["SAHIP", ...owner.roles] },
    });
    fixed++;
    console.log(`   ✓ ${c.name} — ${owner.email}: [${owner.roles.join(", ")}] → [SAHIP, …]`);
  }
  console.log(`\n✅ ${fixed} sahip kaydı onarıldı (${companies.length} firma tarandı)`);
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
