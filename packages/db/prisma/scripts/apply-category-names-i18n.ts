/**
 * i18n Faz 4 — `category-names.i18n.tsv`deki EN/RU kategori adlarını CANLI/staging
 * veritabanına reseed'siz yazar (`apply-category-translations` ile aynı kalıp).
 *
 *   pnpm --filter @rothern/db apply-category-names-i18n            # yaz
 *   pnpm --filter @rothern/db apply-category-names-i18n -- --dry   # yalnız say
 *
 * Yalnız FARKLI satırlar güncellenir; TSV'de olmayan kod dokunulmaz.
 */
import { PrismaClient } from "@prisma/client";
import * as path from "path";
import { readI18nNames } from "./lib/category-keywords";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
const CHUNK = 500;

async function main() {
  const dry = process.argv.includes("--dry");
  const names = readI18nNames(path.resolve(__dirname, "../../src/seeds"));
  if (names.size === 0) {
    console.log("category-names.i18n.tsv yok ya da boş - yapılacak bir şey yok.");
    return;
  }
  const codes = [...names.keys()];
  console.log(`${codes.length} kod okundu`);
  let changed = 0;
  let missing = 0;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const rows = await prisma.category.findMany({ where: { code: { in: slice } }, select: { code: true, nameEn: true, nameRu: true } });
    const byCode = new Map(rows.map((r) => [r.code, r]));
    missing += slice.length - rows.length;
    const updates = slice
      .map((code) => ({ code, want: names.get(code)!, cur: byCode.get(code) }))
      .filter((x) => x.cur && ((x.want.en ?? null) !== x.cur.nameEn || (x.want.ru ?? null) !== x.cur.nameRu));
    changed += updates.length;
    if (!dry && updates.length) {
      await prisma.$transaction(
        updates.map((u) => prisma.category.update({ where: { code: u.code }, data: { nameEn: u.want.en, nameRu: u.want.ru } })),
      );
    }
    process.stdout.write(`\r${Math.min(i + CHUNK, codes.length)}/${codes.length} · değişen ${changed}`);
  }
  console.log(`\n${dry ? "(kuru çalışma) " : ""}güncellenen ${changed} · tabloda olmayan kod ${missing}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
