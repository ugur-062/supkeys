/**
 * Çeviri overlay'ini CANLI tabloya in-place uygular — tam reseed gerektirmez.
 *
 * `seed-categories` sil+kur yapıyor; 158 bin satırı yalnız ad güncellemek için
 * yeniden kurmak gereksiz ve canlıda (kısa da olsa) risk. Bu script yalnız
 * `nameTr` + `searchText` + `keywords` yazar, ağacı ve seçimleri hiç tutmaz.
 *
 * `apply-category-keywords` ile aynı desen: toplu `UPDATE ... FROM (VALUES ...)`,
 * yalnız GERÇEKTEN değişen satır yazılır, idempotent.
 *
 * ÖNCE `check-category-translations` koş — çakışma denetimi ordadır.
 *
 * Çalıştırma: `pnpm --filter @rothern/db apply-category-translations`
 *   --dry   yalnız ne değişeceğini yazar, DB'ye dokunmaz
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { foldSearchText } from "@rothern/shared";
import * as path from "path";
import { buildKeywordsByCode, readTranslations } from "./lib/category-keywords";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

const CHUNK = 500;

async function main() {
  const dry = process.argv.includes("--dry");
  const seedsDir = path.resolve(__dirname, "../../src/seeds");

  const translations = readTranslations(seedsDir);
  if (translations.size === 0) {
    console.log("Çeviri overlay'i boş — yapılacak bir şey yok.");
    return;
  }
  // keywords bileşimi TEK KAYNAKTAN: çeviri İngilizce aslı da buraya giriyor.
  const { byCode: keywordsByCode } = buildKeywordsByCode(seedsDir);

  const codes = [...translations.keys()];
  console.log(`📄 ${codes.length} çeviri okundu\n`);

  const rows: Array<{ code: string; name: string; kw: string; st: string }> = [];
  let missing = 0;
  for (let i = 0; i < codes.length; i += 1000) {
    const slice = codes.slice(i, i + 1000);
    const cats = await prisma.category.findMany({
      where: { code: { in: slice } },
      select: { code: true, nameTr: true, keywords: true, searchText: true },
    });
    const byCode = new Map(cats.map((c) => [c.code, c]));
    missing += slice.length - cats.length;
    for (const code of slice) {
      const cur = byCode.get(code);
      if (!cur) continue;
      const name = translations.get(code)!.tr;
      const kw = keywordsByCode.get(code) ?? "";
      const st = foldSearchText(`${name} ${kw}`);
      if (cur.nameTr === name && cur.keywords === kw && cur.searchText === st) {
        continue;
      }
      rows.push({ code, name, kw, st });
    }
  }

  if (missing) {
    console.warn(`⚠️  ${missing} kod DB'de yok, atlandı`);
  }
  console.log(`   ${rows.length} satır değişiyor, ${codes.length - rows.length - missing} zaten güncel\n`);
  if (rows.length === 0) return;

  if (dry) {
    rows.slice(0, 20).forEach((r) => console.log(`   ${r.code}  → ${r.name}`));
    console.log(`\n(--dry) DB'ye yazılmadı.`);
    return;
  }

  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${r.code}, ${r.name}, ${r.kw}, ${r.st})`),
    );
    await prisma.$executeRaw`
      UPDATE categories AS c
         SET "nameTr" = v.name, keywords = v.kw, "searchText" = v.st
        FROM (VALUES ${values}) AS v(code, name, kw, st)
       WHERE c.code = v.code`;
    done += chunk.length;
    process.stdout.write(`\r   ${done}/${rows.length} yazıldı   `);
  }
  console.log(`\n\n✅ ${done} kategori adı Türkçeleştirildi`);
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
