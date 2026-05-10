/**
 * V2-6 — UNSPSC kategori seed (idempotent).
 * `pnpm --filter @supkeys/db seed-categories`
 */
import { PrismaClient } from "@prisma/client";
import seedData from "../../src/seeds/categories.json";

const prisma = new PrismaClient();

interface SeedSegment {
  code: string;
  letter: string;
  nameTr: string;
  nameEn: string;
  families: Array<{
    code: string;
    nameTr: string;
    nameEn: string;
  }>;
}

interface SeedData {
  version: string;
  language: string;
  segments: SeedSegment[];
}

async function main() {
  const data = seedData as SeedData;
  const totalFamilies = data.segments.reduce(
    (acc, s) => acc + s.families.length,
    0,
  );
  console.log(`🌱 UNSPSC Kategoriler seed ediliyor (${data.version})...`);
  console.log(
    `   ${data.segments.length} segment, ${totalFamilies} family hedefi`,
  );

  let segmentSortOrder = 0;

  for (const segment of data.segments) {
    const segmentRecord = await prisma.category.upsert({
      where: { code: segment.code },
      create: {
        code: segment.code,
        nameTr: segment.nameTr,
        nameEn: segment.nameEn,
        segmentLetter: segment.letter,
        level: 1,
        sortOrder: segmentSortOrder,
        isActive: true,
      },
      update: {
        nameTr: segment.nameTr,
        nameEn: segment.nameEn,
        segmentLetter: segment.letter,
        sortOrder: segmentSortOrder,
        level: 1,
        isActive: true,
      },
    });

    console.log(
      `  ${segment.letter}. ${segment.nameTr} (${segment.families.length} family)`,
    );
    segmentSortOrder += 1;

    let familySortOrder = 0;
    for (const family of segment.families) {
      await prisma.category.upsert({
        where: { code: family.code },
        create: {
          code: family.code,
          nameTr: family.nameTr,
          nameEn: family.nameEn,
          parentId: segmentRecord.id,
          level: 2,
          sortOrder: familySortOrder,
          isActive: true,
        },
        update: {
          nameTr: family.nameTr,
          nameEn: family.nameEn,
          parentId: segmentRecord.id,
          sortOrder: familySortOrder,
          level: 2,
          isActive: true,
        },
      });
      familySortOrder += 1;
    }
  }

  const total = await prisma.category.count();
  const segments = await prisma.category.count({ where: { level: 1 } });
  const families = await prisma.category.count({ where: { level: 2 } });

  console.log(`\n✅ Seed tamamlandı:`);
  console.log(`   Toplam: ${total} kategori`);
  console.log(`   Segment: ${segments}`);
  console.log(`   Family: ${families}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
