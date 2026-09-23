/**
 * i18n Faz 4b — `category-attribute-names.i18n.tsv`deki EN/RU nitelik etiketlerini/seçeneklerini
 * canlı/staging veritabanına reseed'siz yazar.
 *   pnpm --filter @rothern/db apply-category-attribute-names-i18n [-- --dry]
 */
import { PrismaClient } from "@prisma/client";
import * as path from "path";
import { readAttributeI18n } from "./lib/category-keywords";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });

async function main() {
  const dry = process.argv.includes("--dry");
  const map = readAttributeI18n(path.resolve(__dirname, "../../src/seeds"));
  if (map.size === 0) { console.log("category-attribute-names.i18n.tsv yok ya da boş."); return; }
  const rows = await prisma.categoryAttribute.findMany({ select: { id: true, categoryId: true, groupKey: true, nameEn: true, nameRu: true, optionsEn: true, optionsRu: true } });
  let changed = 0;
  for (const r of rows) {
    const t = map.get(`${r.categoryId}:${r.groupKey}`);
    if (!t) continue;
    const same = r.nameEn === t.en && r.nameRu === t.ru && JSON.stringify(r.optionsEn) === JSON.stringify(t.optionsEn) && JSON.stringify(r.optionsRu) === JSON.stringify(t.optionsRu);
    if (same) continue;
    changed += 1;
    if (!dry) await prisma.categoryAttribute.update({ where: { id: r.id }, data: { nameEn: t.en, nameRu: t.ru, optionsEn: t.optionsEn, optionsRu: t.optionsRu } });
  }
  console.log(`${dry ? "(kuru çalışma) " : ""}güncellenen ${changed} / TSV ${map.size} / tablo ${rows.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
