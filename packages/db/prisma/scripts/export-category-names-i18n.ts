/**
 * i18n Faz 4 — veritabanındaki EN/RU kategori adlarını `src/seeds/category-names.i18n.tsv`ye
 * döker (kod ⇥ EN ⇥ RU). Toplu çeviri işi staging'de koştuktan sonra çalıştırılıp
 * dosya depoya YAZILIR; canlı ve yeniden seed bu dosyadan okur, model çağrısı yapmaz.
 *
 *   pnpm --filter @rothern/db export-category-names-i18n
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });

async function main() {
  const rows = await prisma.category.findMany({
    where: { OR: [{ nameEn: { not: null } }, { nameRu: { not: null } }] },
    select: { code: true, nameEn: true, nameRu: true },
    orderBy: { code: "asc" },
  });
  const clean = (v: string | null) => (v ?? "").replace(/[\t\r\n]+/g, " ").trim();
  const out = [
    "# i18n Faz 4 — kategori adları EN/RU (kod ⇥ EN ⇥ RU). ÜRETİLMİŞ dosya: staging'de",
    "# Gemini Pro toplu çevirisi (admin/content-translations/categories/backfill) → export.",
    "# Elle düzeltme serbest (insan kararı kazanır); boş sütun = çeviri yok → Türkçeye düşer.",
    ...rows.map((r) => `${r.code}\t${clean(r.nameEn)}\t${clean(r.nameRu)}`),
  ];
  const file = path.resolve(__dirname, "../../src/seeds/category-names.i18n.tsv");
  fs.writeFileSync(file, out.join("\n") + "\n", "utf-8");
  console.log(`${rows.length} satır yazıldı → ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
