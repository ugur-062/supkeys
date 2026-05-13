/**
 * V2-6 RESET — UNSPSC 4-seviye Türkçe kategori seed.
 * Kaynak: packages/db/src/seeds/categories.txt (her satır 8-haneli kod + isim hiyerarşisi).
 *
 * Format (satır başına 5 veya 6 " | " ayrılmış alan, son alan FSC → ignore):
 *   <code> <segment> | <family> | <class> | <commodity?> | <commodity_repeat?> | <fsc>
 *
 * UNSPSC kod hiyerarşisi:
 *   Segment   : XX000000   (kod ilk 2 hane + 000000)
 *   Family    : XXXX0000   (kod ilk 4 hane + 0000)
 *   Class     : XXXXXX00   (kod ilk 6 hane + 00)
 *   Commodity : XXXXXXXX   (8-haneli tam kod)
 *
 * Çalıştırma: `pnpm --filter @supkeys/db seed-categories` (idempotent — eski veriyi siler).
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

type Level = 1 | 2 | 3 | 4;

interface ParsedCategory {
  code: string;
  level: Level;
  nameTr: string;
  parentCode: string | null;
  segmentLetter: string | null;
}

interface ParsedLine {
  code: string;
  segment: string;
  family: string;
  class: string;
  commodity: string | null;
}

/**
 * Bir satırı parse eder.
 * - code: ilk boşluğa kadar (8 haneli)
 * - " | " ile böl, son parçayı (FSC) at
 * - Geriye kalan 4 parça → class seviyesi; 5 parça → commodity var
 */
function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return null;

  const code = trimmed.substring(0, firstSpace).trim();
  if (!/^\d{8}$/.test(code)) return null;

  const rest = trimmed.substring(firstSpace + 1).trim();
  const parts = rest.split(" | ").map((p) => p.trim());
  parts.pop(); // FSC

  if (parts.length === 4) {
    const [segment, family, className] = parts;
    if (!segment || !family || !className) return null;
    return { code, segment, family, class: className, commodity: null };
  }
  if (parts.length === 5) {
    const [segment, family, className, commodity] = parts;
    if (!segment || !family || !className || !commodity) return null;
    return { code, segment, family, class: className, commodity };
  }

  console.warn(`⚠️  Beklenmeyen format (${parts.length} parça): ${code}`);
  return null;
}

async function main() {
  console.log("🌱 UNSPSC 4-seviye kategori seed başlıyor...\n");

  const filePath = path.resolve(__dirname, "../../src/seeds/categories.txt");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dosya bulunamadı: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  console.log(`📄 ${lines.length} satır okundu`);

  // 1. Unique kategori map'i kur (code → ParsedCategory)
  const parsedMap = new Map<string, ParsedCategory>();
  let skipped = 0;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      skipped++;
      continue;
    }

    const { code, segment, family, class: className, commodity } = parsed;

    const segmentCode = code.substring(0, 2) + "000000";
    const familyCode = code.substring(0, 4) + "0000";
    const classCode = code.substring(0, 6) + "00";

    if (!parsedMap.has(segmentCode)) {
      parsedMap.set(segmentCode, {
        code: segmentCode,
        level: 1,
        nameTr: segment,
        parentCode: null,
        segmentLetter: null, // sonra atanır
      });
    }

    if (!parsedMap.has(familyCode)) {
      parsedMap.set(familyCode, {
        code: familyCode,
        level: 2,
        nameTr: family,
        parentCode: segmentCode,
        segmentLetter: null,
      });
    }

    if (!parsedMap.has(classCode)) {
      parsedMap.set(classCode, {
        code: classCode,
        level: 3,
        nameTr: className,
        parentCode: familyCode,
        segmentLetter: null,
      });
    }

    // Commodity satırı (kodun kendisi class değil) → ayrı kayıt
    if (commodity && code !== classCode) {
      if (!parsedMap.has(code)) {
        parsedMap.set(code, {
          code,
          level: 4,
          nameTr: commodity,
          parentCode: classCode,
          segmentLetter: null,
        });
      }
    }
  }

  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const cat of parsedMap.values()) byLevel[cat.level] = (byLevel[cat.level] ?? 0) + 1;

  console.log(`\n📊 Parse sonucu:`);
  console.log(`   Toplam unique kategori: ${parsedMap.size}`);
  console.log(`   Atlanan satır: ${skipped}`);
  console.log(`   Level 1 (Segment):   ${byLevel[1]}`);
  console.log(`   Level 2 (Family):    ${byLevel[2]}`);
  console.log(`   Level 3 (Class):     ${byLevel[3]}`);
  console.log(`   Level 4 (Commodity): ${byLevel[4]}`);

  // 2. Segment letter ata (kod sırasına göre, A-Z)
  const segments = Array.from(parsedMap.values())
    .filter((c) => c.level === 1)
    .sort((a, b) => a.code.localeCompare(b.code));

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  segments.forEach((seg, idx) => {
    if (idx < alphabet.length) {
      seg.segmentLetter = alphabet.charAt(idx);
    } else {
      const first = Math.floor(idx / alphabet.length) - 1;
      const second = idx % alphabet.length;
      seg.segmentLetter =
        (first >= 0 ? alphabet.charAt(first) : "") + alphabet.charAt(second);
    }
  });

  // 3. Mevcut veriyi temizle (idempotent re-run güvenliği)
  console.log(`\n🧹 Mevcut kategori verisini temizliyor...`);
  await prisma.supplierCategory.deleteMany({});
  await prisma.category.deleteMany({});

  // 4. Level sırayla insert (parent önce); code-asc sortOrder
  console.log(`\n💾 Database'e yazılıyor...`);

  const sorted = Array.from(parsedMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const codeToId = new Map<string, string>();
  let inserted = 0;

  for (let level = 1; level <= 4; level++) {
    const levelCats = sorted.filter((c) => c.level === level);
    let i = 0;
    for (const cat of levelCats) {
      const parentId = cat.parentCode
        ? codeToId.get(cat.parentCode) ?? null
        : null;

      const result = await prisma.category.create({
        data: {
          code: cat.code,
          nameTr: cat.nameTr,
          level: cat.level,
          parentId,
          segmentLetter: cat.segmentLetter,
          sortOrder: i,
          isActive: true,
        },
        select: { id: true },
      });

      codeToId.set(cat.code, result.id);
      inserted++;
      i++;

      if (inserted % 500 === 0) {
        console.log(`   ${inserted}/${parsedMap.size} kategori yazıldı...`);
      }
    }
  }

  const totalDb = await prisma.category.count();
  const segDb = await prisma.category.count({ where: { level: 1 } });
  const famDb = await prisma.category.count({ where: { level: 2 } });
  const clsDb = await prisma.category.count({ where: { level: 3 } });
  const comDb = await prisma.category.count({ where: { level: 4 } });

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
