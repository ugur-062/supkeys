/**
 * i18n Faz 4 — `category-names.i18n.tsv`deki EN/RU kategori adlarını CANLI/staging
 * veritabanına reseed'siz yazar (`apply-category-translations` ile aynı kalıp).
 *
 *   pnpm --filter @rothern/db apply-category-names-i18n            # yaz
 *   pnpm --filter @rothern/db apply-category-names-i18n -- --dry   # yalnız say
 *
 * Yalnız FARKLI satırlar güncellenir; TSV'de olmayan kod dokunulmaz. Arama
 * metni (`searchText`) EN/RU adları da içerir → ad ya da arama metni farklıysa
 * ikisi birlikte yazılır (i18n arama, 2026-09-24).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { categorySearchText } from "@rothern/shared";
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
    const rows = await prisma.category.findMany({ where: { code: { in: slice } }, select: { code: true, nameTr: true, keywords: true, searchText: true, nameEn: true, nameRu: true } });
    const byCode = new Map(rows.map((r) => [r.code, r]));
    missing += slice.length - rows.length;
    const updates = slice
      .map((code) => {
        const want = names.get(code)!;
        const cur = byCode.get(code);
        const st = cur ? categorySearchText({ nameTr: cur.nameTr, keywords: cur.keywords, nameEn: want.en, nameRu: want.ru }) : "";
        return { code, want, cur, st };
      })
      .filter(
        (x) =>
          x.cur &&
          ((x.want.en ?? null) !== x.cur.nameEn || (x.want.ru ?? null) !== x.cur.nameRu || x.st !== x.cur.searchText),
      );
    changed += updates.length;
    if (!dry && updates.length) {
      // Tek toplu UPDATE (satır başına update uzak DB'de 19k satırda 15 dk+ sürüyordu).
      const values = Prisma.join(
        updates.map((u) => Prisma.sql`(${u.code}, ${u.want.en ?? null}, ${u.want.ru ?? null}, ${u.st})`),
      );
      await prisma.$executeRaw`
        UPDATE categories AS c
           SET "nameEn" = v.en, "nameRu" = v.ru, "searchText" = v.st
          FROM (VALUES ${values}) AS v(code, en, ru, st)
         WHERE c.code = v.code`;
    }
    process.stdout.write(`\r${Math.min(i + CHUNK, codes.length)}/${codes.length} · değişen ${changed}`);
  }
  console.log(`\n${dry ? "(kuru çalışma) " : ""}güncellenen ${changed} · tabloda olmayan kod ${missing}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
