/**
 * UNSPSC 4-seviye Türkçe kategori seed (UNGM kaynağı) + platform-özel ekler.
 * Kaynaklar:
 *   - packages/db/src/seeds/unspsc.tsv            (standart UNSPSC, 13k+)
 *   - packages/db/src/seeds/categories-custom.tsv (KOBİ endüstriyel boşluklar:
 *     iskele/kalıp, elektrik pano, çelik konstrüksiyon, KKD, rigging, MRO…
 *     x99xxxxx kod aralığı — UNSPSC ile çakışmaz, parent'ları UNSPSC'de var)
 *   sütunlar: <code> ⇥ <level> ⇥ <parentCode> ⇥ <segmentLetter> ⇥ <nameTr>
 *
 * Hiyerarşi 8-haneli UNSPSC kodundan türetilir (segment=XX000000, family=XXXX0000,
 * class=XXXXXX00, commodity=XXXXXXXX). Category.id = UNSPSC kodu (stabil + parent
 * çözümü bedava). Idempotent: eski kategori + junction'ları siler, yeniden kurar.
 *
 * Çalıştırma: `pnpm --filter @rothern/db seed-categories`
 */
import { PrismaClient } from "@prisma/client";
import { foldSearchText } from "@rothern/shared";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface Cat {
  code: string;
  level: number;
  parentCode: string | null;
  segmentLetter: string | null;
  nameTr: string;
}

// createMany param limiti (Postgres 65535) için satır chunk'la.
const CHUNK = 2000;

async function main() {
  console.log("🌱 UNSPSC kategori seed (UNGM) başlıyor...\n");

  const filePath = path.resolve(__dirname, "../../src/seeds/unspsc.tsv");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dosya bulunamadı: ${filePath}`);
  }
  // Platform-özel ekler opsiyonel — dosya yoksa yalnız standart set yüklenir.
  const customPath = path.resolve(
    __dirname,
    "../../src/seeds/categories-custom.tsv",
  );

  const lines = [
    ...fs.readFileSync(filePath, "utf-8").split("\n"),
    ...(fs.existsSync(customPath)
      ? fs.readFileSync(customPath, "utf-8").split("\n")
      : []),
  ].filter((l) => l.trim());

  const cats: Cat[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const [code, levelStr, parentCode, segmentLetter, nameTr] =
      line.split("\t");
    const level = Number(levelStr);
    if (!code || !/^\d{8}$/.test(code) || level < 1 || level > 4 || !nameTr) {
      console.warn(`⚠️  Atlanan satır: ${line.slice(0, 40)}`);
      continue;
    }
    // Kod çakışması (custom ↔ UNSPSC) sessiz duplicate insert'e dönmesin.
    if (seen.has(code)) {
      console.warn(`⚠️  Yinelenen kod atlandı: ${code} (${nameTr.slice(0, 30)})`);
      continue;
    }
    seen.add(code);
    cats.push({
      code,
      level,
      parentCode: parentCode || null,
      segmentLetter: segmentLetter || null,
      nameTr: nameTr.trim(),
    });
  }

  // Custom satırların parent'ları da sette olmalı — kırık hiyerarşi baştan yakalanır.
  for (const c of cats) {
    if (c.parentCode && !seen.has(c.parentCode)) {
      throw new Error(
        `Kırık hiyerarşi: ${c.code} (${c.nameTr}) parent'ı ${c.parentCode} sette yok`,
      );
    }
  }

  // segmentLetter: her segmente benzersiz sıralı harf (A..Z, AA..) — kod sırasına
  // göre. (TSV'deki UNGM grup harfi non-unique olduğundan UI rozeti için override.)
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  cats
    .filter((c) => c.level === 1)
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((seg, idx) => {
      seg.segmentLetter =
        idx < alphabet.length
          ? alphabet.charAt(idx)
          : alphabet.charAt(Math.floor(idx / alphabet.length) - 1) +
            alphabet.charAt(idx % alphabet.length);
    });

  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const c of cats) byLevel[c.level] = (byLevel[c.level] ?? 0) + 1;

  console.log(`📄 ${cats.length} kategori okundu`);
  console.log(`   Segment:   ${byLevel[1]}`);
  console.log(`   Family:    ${byLevel[2]}`);
  console.log(`   Class:     ${byLevel[3]}`);
  console.log(`   Commodity: ${byLevel[4]}\n`);

  // 1. Eski veriyi temizle
  console.log("🧹 Mevcut kategoriler temizleniyor...");
  await prisma.category.deleteMany({});

  // 2. Seviye sırayla yaz (parent her zaman daha düşük seviyede → önce var olur).
  //    id = code; parentId = parentCode. Chunk'lı createMany.
  console.log("💾 Database'e yazılıyor...");
  let inserted = 0;
  for (let level = 1; level <= 4; level++) {
    const levelCats = cats
      .filter((c) => c.level === level)
      .sort((a, b) => a.code.localeCompare(b.code));

    for (let i = 0; i < levelCats.length; i += CHUNK) {
      const chunk = levelCats.slice(i, i + CHUNK);
      await prisma.category.createMany({
        data: chunk.map((c, idx) => ({
          id: c.code,
          code: c.code,
          nameTr: c.nameTr,
          searchText: foldSearchText(c.nameTr),
          level: c.level,
          parentId: c.parentCode,
          segmentLetter: c.segmentLetter,
          sortOrder: i + idx,
          isActive: true,
        })),
      });
      inserted += chunk.length;
      console.log(`   L${level}: ${inserted}/${cats.length} yazıldı...`);
    }
  }

  const [totalDb, segDb, famDb, clsDb, comDb] = await Promise.all([
    prisma.category.count(),
    prisma.category.count({ where: { level: 1 } }),
    prisma.category.count({ where: { level: 2 } }),
    prisma.category.count({ where: { level: 3 } }),
    prisma.category.count({ where: { level: 4 } }),
  ]);

  console.log(`\n✅ Seed tamamlandı:`);
  console.log(`   Toplam:    ${totalDb}`);
  console.log(`   Segment:   ${segDb}`);
  console.log(`   Family:    ${famDb}`);
  console.log(`   Class:     ${clsDb}`);
  console.log(`   Commodity: ${comDb}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
