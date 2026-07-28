/**
 * rothernId backfill — kısa kodu NULL kalmış firmalara (rebrand öncesi seed
 * artığı) benzersiz kod üretir. Davet zinciri (wizard davetlileri, grup
 * şablonu uygulama, ⋮ davet) tamamen rothernId üzerinden yürüdüğünden kodsuz
 * firma hiçbir yoldan davet edilemiyordu (2026-07-28 "0 davet" vakası).
 * Idempotent — kodu olan firmaya dokunmaz.
 *
 * Çalıştırma: `pnpm --filter @rothern/db backfill-rothern-ids`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// @rothern/shared SHORT_CODE alfabesi (seed.ts ile aynı — karışık karakter yok).
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function generateShortCode(): string {
  const pick = () =>
    Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  return `${pick()}-${pick()}`;
}

async function main() {
  const missing = await prisma.company.findMany({
    where: { rothernId: null },
    select: { id: true, name: true },
  });
  if (missing.length === 0) {
    console.log("✅ Kodsuz firma yok — yapılacak iş yok");
    return;
  }
  let fixed = 0;
  for (const c of missing) {
    // Benzersizlik: @unique kolonuna karşı 5 deneme (kayıt yoluyla aynı desen).
    let assigned: string | null = null;
    for (let i = 0; i < 5 && !assigned; i++) {
      const code = generateShortCode();
      const clash = await prisma.company.findUnique({
        where: { rothernId: code },
        select: { id: true },
      });
      if (!clash) assigned = code;
    }
    if (!assigned) {
      console.error(`   ✗ ${c.name}: 5 denemede benzersiz kod üretilemedi`);
      continue;
    }
    await prisma.company.update({
      where: { id: c.id },
      data: { rothernId: assigned },
    });
    fixed++;
    console.log(`   ✓ ${c.name} → ${assigned}`);
  }
  console.log(`\n✅ ${fixed}/${missing.length} firmaya kod atandı`);
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
