/**
 * i18n Faz 4 — veritabanındaki EN/RU kategori adlarını `src/seeds/category-names.i18n.tsv`ye
 * döker (kod ⇥ EN ⇥ RU). Toplu çeviri işi staging'de koştuktan sonra çalıştırılıp
 * dosya depoya YAZILIR; canlı ve yeniden seed bu dosyadan okur, model çağrısı yapmaz.
 *
 *   pnpm --filter @rothern/db export-category-names-i18n                  # fark özeti + (yalnız yeni satır varsa) yaz
 *   pnpm --filter @rothern/db export-category-names-i18n -- --dry         # yalnız fark özeti
 *   pnpm --filter @rothern/db export-category-names-i18n -- --overwrite   # mevcut satırları da ez
 *
 * ⚠ ÜZERİNE YAZMA KORUMASI (2026-10-09): dosya elle de düzeltilir (insan kararı
 * kazanır) ve `apply-category-names-i18n` ile veritabanına gider. Uygulama HENÜZ
 * koşulmamış bir veritabanından dışa aktarım, eski adları sessizce dosyaya geri
 * koyuyordu ("Logistics" → "Transportation and Storage and Mail Services").
 * Artık her koşuda dosya ↔ veritabanı farkı basılır; dosyadaki MEVCUT bir satırı
 * değiştirecek ya da düşürecek dışa aktarım `--overwrite` olmadan YAZILMAZ
 * (çıkış 1). Sıra: önce `apply-category-names-i18n`, sonra (gerekiyorsa) export.
 * Dosya başındaki açıklama bloğu korunur. Fark hesabı: `lib/i18n-name-export.ts`.
 */
import { PrismaClient } from "@prisma/client";
import { prepareScriptDatabase } from "./lib/script-env";
import * as fs from "fs";
import * as path from "path";
import { readI18nNames } from "./lib/category-keywords";
import {
  diffI18nNameExport,
  formatI18nExportDiff,
  leadingCommentBlock,
  planI18nNameExport,
  toI18nExportRows,
} from "./lib/i18n-name-export";

const prisma = new PrismaClient({ datasourceUrl: prepareScriptDatabase("export-category-names-i18n") });

const DEFAULT_HEADER = [
  "# i18n Faz 4 — kategori adları EN/RU (kod ⇥ EN ⇥ RU). ÜRETİLMİŞ dosya: staging'de",
  "# Gemini Pro toplu çevirisi (admin/content-translations/categories/backfill) → export.",
  "# Elle düzeltme serbest (insan kararı kazanır); boş sütun = çeviri yok → Türkçeye düşer.",
];

async function main() {
  const flags = { dry: process.argv.includes("--dry"), overwrite: process.argv.includes("--overwrite") };
  const seedsDir = path.resolve(__dirname, "../../src/seeds");
  const file = path.join(seedsDir, "category-names.i18n.tsv");

  const rows = toI18nExportRows(
    await prisma.category.findMany({
      where: { OR: [{ nameEn: { not: null } }, { nameRu: { not: null } }] },
      select: { code: true, nameEn: true, nameRu: true },
      orderBy: { code: "asc" },
    }),
  );

  const diff = diffI18nNameExport(readI18nNames(seedsDir), rows);
  for (const line of formatI18nExportDiff(diff)) console.log(line);

  const action = planI18nNameExport(diff, flags);
  if (action === "dry") {
    console.log("\n(--dry) file not written.");
    return;
  }
  if (action === "noop") {
    console.log("\nfile already matches the database; nothing to write.");
    return;
  }
  if (action === "refuse") {
    console.error(
      `\nREFUSED: this export would replace ${diff.changed.length} and drop ${diff.dropped.length} existing row(s) of ` +
        "category-names.i18n.tsv. The file is the source of the EN/RU names; a database where " +
        "apply-category-names-i18n has not been run yet still holds the OLDER names. " +
        "Run apply-category-names-i18n first, or rerun with -- --overwrite if the database really is the newer side.",
    );
    process.exitCode = 1;
    return;
  }

  const header = leadingCommentBlock(fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null, DEFAULT_HEADER);
  const out = [...header, ...rows.map((r) => `${r.code}\t${r.en ?? ""}\t${r.ru ?? ""}`)];
  fs.writeFileSync(file, out.join("\n") + "\n", "utf-8");
  console.log(`\n${rows.length} satır yazıldı → ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
