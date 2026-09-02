/**
 * Kategori → nitelik matrisini yazar (Faz 2).
 *
 * IDEMPOTENT: `upsert` ile çalışır, tekrar koşulabilir. Kaynak dosyada
 * OLMAYAN ama veritabanında bulunan satırlar SİLİNİR — matris tek kaynak
 * (`src/seeds/category-attributes.ts`), veritabanı onun kopyası.
 *
 * Fail-loud: kaynakta katalogda karşılığı olmayan bir kategori kodu varsa
 * DURUR. Sessizce atlamak, o segmentin niteliklerinin hiç sorulmadığı ama
 * kimsenin fark etmediği bir duruma yol açardı.
 *
 *   npx tsx prisma/scripts/seed-category-attributes.ts
 */
import { PrismaClient, type CategoryAttributeType } from "@prisma/client";
import { CATEGORY_ATTRIBUTES } from "../../src/seeds/category-attributes";

const prisma = new PrismaClient();

async function main() {
  const codes = Object.keys(CATEGORY_ATTRIBUTES);

  // 1) Kategori kodları gerçekten var mı?
  const found = await prisma.category.findMany({
    where: { id: { in: codes } },
    select: { id: true, nameTr: true, level: true },
  });
  const missing = codes.filter((c) => !found.some((f) => f.id === c));
  if (missing.length > 0) {
    throw new Error(
      `Katalogda olmayan kategori kodu: ${missing.join(", ")} — matris yazılmadı.`,
    );
  }

  // 2) Upsert
  let written = 0;
  for (const [categoryId, defs] of Object.entries(CATEGORY_ATTRIBUTES)) {
    for (const [i, d] of defs.entries()) {
      await prisma.categoryAttribute.upsert({
        where: { categoryId_groupKey: { categoryId, groupKey: d.key } },
        create: {
          categoryId,
          groupKey: d.key,
          nameTr: d.nameTr,
          type: d.type as CategoryAttributeType,
          options: d.options ?? [],
          unit: d.unit ?? null,
          isRequired: d.required ?? false,
          sortOrder: i,
        },
        update: {
          nameTr: d.nameTr,
          type: d.type as CategoryAttributeType,
          options: d.options ?? [],
          unit: d.unit ?? null,
          isRequired: d.required ?? false,
          sortOrder: i,
        },
      });
      written += 1;
    }
  }

  // 3) Kaynakta olmayanları sil (matris tek kaynak)
  const keep = Object.entries(CATEGORY_ATTRIBUTES).flatMap(([cid, defs]) =>
    defs.map((d) => `${cid}|${d.key}`),
  );
  const all = await prisma.categoryAttribute.findMany({
    select: { id: true, categoryId: true, groupKey: true },
  });
  const stale = all.filter((a) => !keep.includes(`${a.categoryId}|${a.groupKey}`));
  if (stale.length > 0) {
    await prisma.categoryAttribute.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  }

  console.log(`Nitelik yazıldı : ${written}`);
  console.log(`Silinen (bayat) : ${stale.length}`);
  console.log(`Kategori sayısı : ${codes.length}`);
  for (const f of found.sort((a, b) => a.id.localeCompare(b.id))) {
    const n = CATEGORY_ATTRIBUTES[f.id].length;
    console.log(`  L${f.level} ${f.id}  ${n} nitelik  — ${f.nameTr}`);
  }
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
