/**
 * GÖRÜNÜRLÜK ÜLKESİ DÖNÜŞÜMÜ (2026-09-21, tek seferlik, idempotent).
 *
 * Eski model: `isInternational=false` → yalnız sahibin ülkesi görür (hedef
 * listesi boş). Yeni model: `targetCountries` tek kaynak, BOŞ = tüm ülkeler.
 * Dönüşüm olmadan eski "yurtiçi" talepler bir anda dünyaya açılırdı →
 * `isInternational=false ∧ targetCountries=[]` olanlara `[sahip ülkesi]`
 * yazılır. Uluslararası + boş hedefli talepler "tüm ülkeler" olarak KALIR
 * (bilinçli: artık yerli tedarikçi de görür). Hedefi dolu olanlar aynen.
 *
 * Koşum: `pnpm --filter @rothern/db backfill-listing-scope` (kök .env =
 * staging; canlı için `ENV_FILE=../../.env.prod.local`). `DRY=1` yalnız sayar.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dry = process.env.DRY === "1";
  const rows = await prisma.listing.findMany({
    where: { isInternational: false, targetCountries: { isEmpty: true } },
    select: { id: true, number: true, company: { select: { country: true } } },
  });
  console.log(`yurtiçi + boş hedef: ${rows.length} talep${dry ? " (DRY — yazılmadı)" : ""}`);
  let done = 0;
  for (const r of rows) {
    const country = r.company.country;
    if (!country) {
      console.log(`  ${r.number ?? r.id}: sahip ülkesi yok — atlandı`);
      continue;
    }
    if (!dry) {
      await prisma.listing.update({ where: { id: r.id }, data: { targetCountries: [country] } });
    }
    done += 1;
  }
  const intlOpen = await prisma.listing.count({ where: { isInternational: true, targetCountries: { isEmpty: true } } });
  console.log(`yazıldı: ${done} · uluslararası+boş (tüm ülkeler olarak kaldı): ${intlOpen}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
