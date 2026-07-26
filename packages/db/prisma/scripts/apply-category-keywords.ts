/**
 * Küratörlü kategori eşanlamlılarını (category-keywords.tsv) CANLI tabloya
 * in-place uygular — tam reseed gerektirmez (seed deleteMany+recreate yapar;
 * canlıda kısa da olsa boş-kategori penceresi açmamak için bu script tercih
 * edilir). Her satır: keywords kolonu + searchText = fold(nameTr + keywords).
 *
 * Çalıştırma: `pnpm --filter @rothern/db apply-category-keywords`
 * Idempotent; TSV'de olmayan kategorilere dokunmaz.
 */
import { PrismaClient } from "@prisma/client";
import { foldSearchText } from "@rothern/shared";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const filePath = path.resolve(
    __dirname,
    "../../src/seeds/category-keywords.tsv",
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dosya bulunamadı: ${filePath}`);
  }

  const entries: Array<{ code: string; keywords: string }> = [];
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const [code, kw] = line.split("\t");
    if (code?.trim() && kw?.trim()) {
      entries.push({ code: code.trim(), keywords: kw.trim() });
    }
  }
  console.log(`📄 ${entries.length} eşanlamlı kaydı okundu\n`);

  let applied = 0;
  for (const e of entries) {
    const cat = await prisma.category.findUnique({
      where: { code: e.code },
      select: { nameTr: true },
    });
    if (!cat) {
      console.warn(`⚠️  Kod DB'de yok, atlandı: ${e.code}`);
      continue;
    }
    await prisma.category.update({
      where: { code: e.code },
      data: {
        keywords: e.keywords,
        searchText: foldSearchText(`${cat.nameTr} ${e.keywords}`),
      },
    });
    applied++;
    console.log(`   ✓ ${e.code} ${cat.nameTr}`);
  }
  console.log(`\n✅ ${applied}/${entries.length} kategori güncellendi`);
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
