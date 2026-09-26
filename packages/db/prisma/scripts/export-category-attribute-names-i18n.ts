/**
 * i18n Faz 4b — veritabanındaki EN/RU nitelik etiketlerini/seçeneklerini
 * `src/seeds/category-attribute-names.i18n.tsv`ye döker (staging toplu çevirisinden sonra, depoya yazılır).
 *   pnpm --filter @rothern/db export-category-attribute-names-i18n
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
const clean = (v: string | null | undefined) => (v ?? "").replace(/[\t\r\n|]+/g, " ").trim();

async function main() {
  const rows = await prisma.categoryAttribute.findMany({
    where: { OR: [{ nameEn: { not: null } }, { nameRu: { not: null } }] },
    select: { categoryId: true, groupKey: true, nameEn: true, nameRu: true, optionsEn: true, optionsRu: true },
    orderBy: [{ categoryId: "asc" }, { groupKey: "asc" }],
  });
  const out = [
    "# i18n Faz 4b — nitelik etiketi/seçenek çevirileri (kategori ⇥ groupKey ⇥ EN ⇥ RU ⇥ EN seçenekler | ⇥ RU seçenekler |).",
    "# ÜRETİLMİŞ (staging Gemini Pro toplu işi → export). Elle düzeltme serbest; seçenekler `options` ile aynı sırada.",
    ...rows.map((r) => [r.categoryId, r.groupKey, clean(r.nameEn), clean(r.nameRu), r.optionsEn.map(clean).join("|"), r.optionsRu.map(clean).join("|")].join("\t")),
  ];
  const file = path.resolve(__dirname, "../../src/seeds/category-attribute-names.i18n.tsv");
  fs.writeFileSync(file, out.join("\n") + "\n", "utf-8");
  console.log(`${rows.length} satır yazıldı → ${path.relative(process.cwd(), file)}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
