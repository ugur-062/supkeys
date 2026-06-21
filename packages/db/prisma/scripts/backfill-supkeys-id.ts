import { generateShortCode } from "@supkeys/shared";
import { PrismaClient } from "@prisma/client";

/**
 * Faz 3 madde 6 — mevcut tenant + supplier satırlarına benzersiz Supkeys ID
 * (Crockford Base32, K7X9-3M2P) doldurur. Yeni kayıtlar creation'da set edilir.
 *
 * Çalıştırma:
 *   pnpm --filter @supkeys/db backfill-supkeys-id
 */

const prisma = new PrismaClient();

async function uniqueCode(
  taken: Set<string>,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = generateShortCode();
    if (taken.has(code)) continue;
    if (await exists(code)) continue;
    taken.add(code);
    return code;
  }
  throw new Error("Benzersiz Supkeys ID üretilemedi (50 deneme)");
}

async function main() {
  const taken = new Set<string>();

  // Tenant'lar
  const tenants = await prisma.tenant.findMany({
    where: { supkeysId: null },
    select: { id: true },
  });
  for (const t of tenants) {
    const code = await uniqueCode(
      taken,
      async (c) => (await prisma.tenant.count({ where: { supkeysId: c } })) > 0,
    );
    await prisma.tenant.update({ where: { id: t.id }, data: { supkeysId: code } });
  }
  console.log(`✓ ${tenants.length} tenant Supkeys ID dolduruldu`);

  // Supplier'lar
  const suppliers = await prisma.supplier.findMany({
    where: { supkeysId: null },
    select: { id: true },
  });
  for (const s of suppliers) {
    const code = await uniqueCode(
      taken,
      async (c) =>
        (await prisma.supplier.count({ where: { supkeysId: c } })) > 0,
    );
    await prisma.supplier.update({
      where: { id: s.id },
      data: { supkeysId: code },
    });
  }
  console.log(`✓ ${suppliers.length} supplier Supkeys ID dolduruldu`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
