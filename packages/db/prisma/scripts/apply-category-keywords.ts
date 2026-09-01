/**
 * Kategori eşanlamlılarını CANLI tabloya in-place uygular — tam reseed
 * gerektirmez (seed deleteMany+recreate yapar; canlıda kısa da olsa
 * boş-kategori penceresi açmamak için bu script tercih edilir).
 * Her satır: keywords kolonu + searchText = fold(nameTr + keywords).
 *
 * İKİ KAYNAK, ELLE KÜRASYON ÜSTÜN:
 *   1. category-keywords.generated.tsv — gen-category-keywords.ts çıktısı (toplu)
 *   2. category-keywords.tsv           — ELLE yazılan (aynı kod varsa EZER)
 * Gerekçe: üretilen sözlük taban kelime hazinesini verir; insan kararı
 * (yanlış eşleşme düzeltmesi, kürasyon döngüsünden gelen terim) son sözdür ve
 * yeniden üretimde kaybolmamalıdır.
 *
 * Çalıştırma: `pnpm --filter @rothern/db apply-category-keywords`
 * Idempotent; TSV'de olmayan kategorilere dokunmaz, DEĞİŞMEYEN satırı yazmaz.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { foldSearchText } from "@rothern/shared";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

/**
 * Toplu yazım grubu. Eskiden her satır için ayrı findUnique+update atılıyordu;
 * uzak Supabase'de tur başına ~215 ms olduğundan 55.000 satırlık üretilmiş
 * sözlük saatler sürerdi. Tek `UPDATE ... FROM (VALUES ...)` ile grup başına
 * tek tur.
 */
const CHUNK = 500;

function readTsv(filePath: string, into: Map<string, string>): number {
  if (!fs.existsSync(filePath)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [code, kw] = line.split("\t");
    if (code?.trim() && kw?.trim()) {
      into.set(code.trim(), kw.trim());
      n++;
    }
  }
  return n;
}

async function main() {
  const dir = path.resolve(__dirname, "../../src/seeds");
  const entries = new Map<string, string>();

  // Sıra kritik: üretilen ÖNCE okunur, elle küratörlü SONRA — aynı kod
  // geldiğinde Map.set elle yazılanı bırakır.
  const gen = readTsv(path.join(dir, "category-keywords.generated.tsv"), entries);
  const cur = readTsv(path.join(dir, "category-keywords.tsv"), entries);
  if (entries.size === 0) {
    throw new Error(`Hiç eşanlamlı kaydı bulunamadı: ${dir}`);
  }
  console.log(
    `📄 ${entries.size} kategori (üretilen ${gen} + elle ${cur}, çakışanda elle kazandı)\n`,
  );

  const cats = await prisma.category.findMany({
    where: { code: { in: [...entries.keys()] } },
    select: { code: true, nameTr: true, keywords: true },
  });
  const byCode = new Map(cats.map((c) => [c.code, c]));

  const missing = [...entries.keys()].filter((c) => !byCode.has(c));
  if (missing.length) {
    console.warn(
      `⚠️  ${missing.length} kod DB'de yok, atlanacak (ilk 10): ${missing.slice(0, 10).join(", ")}`,
    );
  }

  // Yalnız GERÇEKTEN değişenler yazılır — tekrar koşumlar bedavaya yakın olur.
  const rows: Array<{ code: string; kw: string; st: string }> = [];
  for (const [code, kw] of entries) {
    const cat = byCode.get(code);
    if (!cat) continue;
    if (cat.keywords === kw) continue;
    rows.push({ code, kw, st: foldSearchText(`${cat.nameTr} ${kw}`) });
  }
  console.log(`   ${rows.length} satır değişiyor, ${cats.length - rows.length} zaten güncel\n`);

  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${r.code}, ${r.kw}, ${r.st})`),
    );
    await prisma.$executeRaw`
      UPDATE categories AS c
         SET keywords = v.kw, "searchText" = v.st
        FROM (VALUES ${values}) AS v(code, kw, st)
       WHERE c.code = v.code`;
    done += chunk.length;
    process.stdout.write(`\r   ${done}/${rows.length} yazıldı   `);
  }

  console.log(`\n\n✅ ${done} kategori güncellendi (${entries.size} kayıt okundu)`);
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
