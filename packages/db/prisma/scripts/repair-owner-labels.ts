/**
 * Sahiplik etiketi onarımı — company.ownerUserId'si olduğu hâlde rol dizisinde
 * SAHIP taşımayan kullanıcılara SAHIP'i geri ekler (eski/tutarsız veri).
 * Çalışma zamanı normalizasyonu (jwt strategy + /me + rol güncelleme) bu
 * durumu zaten maskeler; script DB'yi de gerçekle hizalar. Idempotent.
 *
 * Çalıştırma: `pnpm --filter @rothern/db repair-owner-labels`
 */
import { PrismaClient } from "@prisma/client";
import { permissionsForRoles } from "@rothern/shared";

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
      select: { id: true, email: true, roles: true, permissions: true },
    });
    if (!owner || owner.roles.includes("SAHIP")) continue;
    const roles = ["SAHIP", ...owner.roles] as typeof owner.roles;
    await prisma.companyUser.update({
      where: { id: owner.id },
      // İzin listesi boşsa (eski satır) hazır setten doldur; doluysa dokunma.
      data: {
        roles,
        ...(owner.permissions.length === 0
          ? { permissions: permissionsForRoles(roles) }
          : {}),
      },
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
